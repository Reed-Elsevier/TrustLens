import { UPLOAD_LIMITS } from "@/lib/analyze/config";

export type PdfErrorCode = "INVALID_PDF" | "NO_TEXT" | "TOO_LONG" | "PARSE_TIMEOUT";

/** Safe-to-show failures; messages never contain file contents. */
export class PdfError extends Error {
  constructor(
    readonly code: PdfErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface ParsedPdf {
  pages: number;
  text: string;
  title: string | null;
  truncated: boolean;
}

export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  return head.includes("%PDF-");
}

export function normalizeText(raw: string): string {
  return raw
    .replace(/\u00ad/g, "")
    .replace(/-\n(?=[a-z])/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new PdfError("PARSE_TIMEOUT", "Reading the PDF took too long. Try a smaller or simpler file."));
    }, ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/** Extracts text in memory only; nothing is written to disk and no PDF scripts are executed. */
export async function parsePdf(bytes: Uint8Array): Promise<ParsedPdf> {
  if (!looksLikePdf(bytes)) throw new PdfError("INVALID_PDF", "This file does not look like a PDF.");
  const { getDocumentProxy, extractText, getMeta } = await import("unpdf");
  let doc: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    doc = await getDocumentProxy(new Uint8Array(bytes));
  } catch (error) {
    const encrypted = error instanceof Error && /password/i.test(error.name + error.message);
    throw new PdfError("INVALID_PDF", encrypted ? "Password-protected PDFs can't be analyzed." : "This PDF could not be read. It may be damaged.");
  }
  try {
    if (doc.numPages > UPLOAD_LIMITS.maxPages) {
      throw new PdfError("TOO_LONG", `This PDF has ${doc.numPages} pages; the limit is ${UPLOAD_LIMITS.maxPages}.`);
    }
    const extracted = await withTimeout(extractText(doc, { mergePages: false }), UPLOAD_LIMITS.parseTimeoutMs, () => void doc.loadingTask.destroy().catch(() => undefined));
    let text = normalizeText(extracted.text.join("\n"));
    const truncated = text.length > UPLOAD_LIMITS.maxChars;
    if (truncated) text = text.slice(0, UPLOAD_LIMITS.maxChars);
    if (text.length < UPLOAD_LIMITS.minChars) {
      throw new PdfError("NO_TEXT", "Almost no selectable text was found. Scanned PDFs need OCR before analysis.");
    }
    let title: string | null = null;
    try {
      const info = (await getMeta(doc)).info as { Title?: unknown } | undefined;
      if (typeof info?.Title === "string" && info.Title.trim()) title = info.Title.trim().slice(0, 200);
    } catch {
      title = null;
    }
    return { pages: extracted.totalPages, text, title, truncated };
  } finally {
    void doc.loadingTask.destroy().catch(() => undefined);
  }
}

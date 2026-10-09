import { NextRequest, NextResponse } from "next/server";
import { UPLOAD_LIMITS } from "@/lib/analyze/config";
import { analyzeError, badRequest, withApiRequest } from "@/lib/analyze/http";
import { PdfError, type PdfErrorCode } from "@/lib/analyze/pdf";
import { analyzePdf } from "@/lib/analyze/service";

const STATUS_BY_PDF_ERROR: Record<PdfErrorCode, number> = { INVALID_PDF: 415, NO_TEXT: 422, TOO_LONG: 413, PARSE_TIMEOUT: 422 };
const TOO_LARGE = `The PDF is larger than ${UPLOAD_LIMITS.maxBytes / 1024 / 1024} MB.`;

export async function POST(request: NextRequest) {
  return withApiRequest("POST /api/analyze", async () => {
    // Multipart framing adds a little overhead on top of the file itself.
    if (Number(request.headers.get("content-length") ?? 0) > UPLOAD_LIMITS.maxBytes + 64 * 1024) {
      return analyzeError(413, "PAYLOAD_TOO_LARGE", TOO_LARGE);
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return badRequest('Send the PDF as multipart/form-data in a field named "file".');
    }
    const file = form.get("file");
    if (!(file instanceof File)) return badRequest('Missing PDF: use a multipart field named "file".');
    if (file.size === 0) return badRequest("The file is empty.");
    if (file.size > UPLOAD_LIMITS.maxBytes) return analyzeError(413, "PAYLOAD_TOO_LARGE", TOO_LARGE);

    try {
      return NextResponse.json(await analyzePdf(new Uint8Array(await file.arrayBuffer()), file.name));
    } catch (error) {
      if (error instanceof PdfError) return analyzeError(STATUS_BY_PDF_ERROR[error.code], error.code, error.message);
      throw error;
    }
  });
}

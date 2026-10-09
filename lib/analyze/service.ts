import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { db } from "@/lib/db";
import { SYNTHETIC_NOTICE } from "@/lib/legal/config";
import { detectAnomalies } from "@/lib/analyze/anomalies";
import { buildFindings } from "@/lib/analyze/findings";
import { assessIntegrity } from "@/lib/analyze/integrity";
import { scanLegal } from "@/lib/analyze/legalScan";
import { parsePdf } from "@/lib/analyze/pdf";
import { checkPlagiarism } from "@/lib/analyze/plagiarism";
import { getAnalysis, putAnalysis } from "@/lib/analyze/store";
import { analyzeStructure, completenessScore } from "@/lib/analyze/structure";
import type { AnalysisResult } from "@/lib/analyze/types";
import { splitChunks } from "@/lib/text/similarity";

export const ANALYSIS_NOTICE = `Automated screening: indicators need editorial judgement and are not proof of misconduct. ${SYNTHETIC_NOTICE}`;

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "paper.pdf";
  return base.replace(/[\u0000-\u001f\u007f<>"|?*]/g, "").trim().slice(0, 120) || "paper.pdf";
}

/** Runs the whole deterministic pipeline on an uploaded PDF. Identical files reuse the cached analysis. */
export async function analyzePdf(bytes: Uint8Array, fileName: string, database: Database.Database = db): Promise<AnalysisResult> {
  const id = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const existing = getAnalysis(id);
  if (existing) {
    // Same bytes, same analysis; only the display name can differ between uploads.
    const name = sanitizeFileName(fileName);
    return name === existing.result.file.name ? existing.result : { ...existing.result, file: { ...existing.result.file, name } };
  }

  const parsed = await parsePdf(bytes);
  const { abstractText, ...structure } = analyzeStructure(parsed.text);
  const integrity = assessIntegrity({ structure, abstractText, text: parsed.text, anomalies: detectAnomalies(parsed.text) }, database);
  const legal = scanLegal(parsed.text, database);
  const plagiarism = checkPlagiarism(parsed.text, parsed.truncated, database);
  const result: AnalysisResult = {
    id,
    notice: ANALYSIS_NOTICE,
    file: { name: sanitizeFileName(fileName), sizeBytes: bytes.byteLength, pages: parsed.pages, words: structure.words, truncated: parsed.truncated, title: parsed.title },
    structure,
    integrity,
    plagiarism,
    legal,
    findings: buildFindings({ structure, integrity, legal, plagiarism }),
    completenessScore: completenessScore(structure),
  };
  putAnalysis({ result, text: parsed.text, chunks: splitChunks(parsed.text), abstractText });
  return result;
}

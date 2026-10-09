import type { AnalysisResult } from "@/lib/analyze/types";

/** Pure and client-safe: starter questions tailored to what the analysis actually found. */
export function suggestQuestions(result: Pick<AnalysisResult, "findings" | "legal">): string[] {
  const ids = result.findings.map((finding) => finding.id);
  const questions = ["What are the biggest gaps in this paper?"];
  if (ids.some((id) => id.startsWith("legal.overruled.") || id.startsWith("legal.superseded."))) questions.push("Which legal authorities are no longer good law?");
  else if (result.legal.relevance !== "none") questions.push("Are the legal authorities in this paper still good law?");
  if (ids.includes("integrity.similarity")) questions.push("How similar is this paper to published work?");
  if (ids.some((id) => id.startsWith("structure.statement."))) questions.push("Which required statements are missing?");
  if (ids.some((id) => id.startsWith("references."))) questions.push("How reliable is the reference list?");
  questions.push("What should the authors fix first?");
  return questions.slice(0, 4);
}

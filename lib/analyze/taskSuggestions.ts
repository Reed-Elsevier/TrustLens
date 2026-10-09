import type { AnalysisResult, TaskProposal } from "@/lib/analyze/types";
import { buildIndex, rank } from "@/lib/text/similarity";

export function proposeTasks(result: AnalysisResult, question: string): TaskProposal[] {
  const general = /\b(fix|improv|missing|gaps?|needs?|tasks?|bucket\s*list|next steps?)/i.test(question);
  const relevant = rank(
    buildIndex(result.findings.map((finding) => ({ id: finding.id, text: `${finding.title} ${finding.detail} ${finding.fix}` }))),
    question, 3,
  ).filter((match) => match.score >= 0.08).map((match) => match.id);
  const candidates = general && relevant.length === 0
    ? result.findings.slice(0, 3)
    : relevant.map((id) => result.findings.find((finding) => finding.id === id)).filter((finding) => finding !== undefined);
  return candidates
    .slice(0, 3).map((finding) => ({
      title: finding.title, action: finding.fix, severity: finding.severity, findingIds: [finding.id],
    }));
}

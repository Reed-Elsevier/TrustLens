import { REVIEW_CONFIG } from "@/lib/analyze/config";
import { askClaude, clampWords, InvalidAnswer, stripFences } from "@/lib/analyze/ai";
import { REVIEW_PROMPT } from "@/lib/analyze/prompts";
import { getAnalysis, type StoredAnalysis } from "@/lib/analyze/store";
import type { AnalysisResult, FindingArea, Review, ReviewGap, ReviewResponse, Severity } from "@/lib/analyze/types";

const WHY_IT_MATTERS: Record<FindingArea, string> = {
  integrity: "Integrity indicators determine whether the paper needs a closer editorial or research-integrity check before publication.",
  legal: "Reliance on authorities that are no longer good law can undermine the paper's legal conclusions.",
  structure: "Reporting standards let reviewers and readers judge, reproduce and trust the work.",
  references: "A complete, current reference list shows the work is grounded in the literature and can be checked.",
};

const AREAS: FindingArea[] = ["integrity", "legal", "structure", "references"];
const SEVERITIES: Severity[] = ["high", "medium", "low"];

/** Compact, bounded evidence for the model: computed facts plus a short abstract excerpt. */
export function buildEvidencePacket(entry: StoredAnalysis) {
  const { result } = entry;
  return {
    file: { pages: result.file.pages, words: result.file.words, truncated: result.file.truncated },
    integrity: {
      score: result.integrity.score,
      level: result.integrity.level,
      comparedAgainst: result.integrity.comparedAgainst,
      signals: result.integrity.signals.map(({ key, points, maxPoints, applicable, evidence }) => ({ key, points, maxPoints, applicable, evidence })),
      closestMatches: result.integrity.matches.slice(0, 3).map(({ paperId, cosine, containment }) => ({ paperId, cosine, containment })),
      anomalies: result.integrity.anomalies.map(({ kind, count, example }) => ({ kind, count, example: example.slice(0, 120) })),
    },
    plagiarism: {
      available: result.plagiarism.available,
      corpusSize: result.plagiarism.corpusSize,
      checkedWords: result.plagiarism.checkedWords,
      overlapPercent: result.plagiarism.overlapPercent,
      matchCount: result.plagiarism.matchCount,
      truncated: result.plagiarism.truncated,
      notice: result.plagiarism.notice,
      matches: result.plagiarism.matches.slice(0, 3),
    },
    structure: {
      completenessScore: result.completenessScore,
      sectionsMissing: result.structure.sections.filter((s) => !s.found).map((s) => s.label),
      statementsMissing: result.structure.statements.filter((s) => s.applicable && !s.found).map((s) => s.label),
      references: result.structure.references,
    },
    legal: {
      relevance: result.legal.relevance,
      databaseLoaded: result.legal.available,
      counts: result.legal.counts,
      authorities: result.legal.authorities.slice(0, 10).map(({ docId, title, docType, jurisdiction, verdict, reasons, mentions }) => ({ docId, title, docType, jurisdiction, verdict, reasons, mentions })),
      unverified: result.legal.unverified.slice(0, 8).map((citation) => citation.text),
    },
    findings: result.findings.map(({ id, area, severity, title, detail }) => ({ id, area, severity, title, detail })),
    abstractExcerpt: entry.abstractText?.slice(0, 900) ?? null,
  };
}

export function fallbackReview(result: AnalysisResult, aiEnabled = true): Review {
  const { findings, integrity, legal } = result;
  const attention = legal.counts.overruled + legal.counts.superseded + legal.counts.questionable;
  const gaps: ReviewGap[] = findings.slice(0, REVIEW_CONFIG.maxGaps).map((finding) => ({
    title: finding.title,
    severity: finding.severity,
    area: finding.area,
    whatIsMissing: finding.detail,
    whyItMatters: WHY_IT_MATTERS[finding.area],
    howToFix: finding.fix,
    findingIds: [finding.id],
  }));
  const needs = [...new Set(findings.map((finding) => finding.fix))].slice(0, REVIEW_CONFIG.maxNeeds);
  const questions: string[] = [];
  for (const finding of findings) {
    if (questions.length >= REVIEW_CONFIG.maxQuestions) break;
    if (finding.id === "integrity.similarity") questions.push("Can you explain the textual overlap with the closest published paper and cite it where appropriate?");
    else if (finding.id.startsWith("legal.overruled.") || finding.id.startsWith("legal.superseded.")) questions.push(`Why does the paper rely on this authority without noting its later treatment? (${finding.title})`);
    else if (finding.id.startsWith("structure.statement.")) questions.push(`Please add: ${finding.title.replace(/^Missing: /, "")}.`);
    else if (finding.id === "legal.unverified") questions.push("Can you provide full citations for the legal authorities that could not be verified?");
  }
  const strengths: string[] = [];
  const present = result.structure.sections.filter((s) => s.found).length;
  if (present >= result.structure.sections.length - 1) strengths.push(`Most standard sections are present (${present} of ${result.structure.sections.length}).`);
  if (legal.counts.goodLaw > 0) strengths.push(`${legal.counts.goodLaw} cited authorit${legal.counts.goodLaw === 1 ? "y is" : "ies are"} still good law.`);
  if (integrity.level === "low") strengths.push("No strong integrity indicators were detected.");
  const high = findings.filter((f) => f.severity === "high").length;
  return {
    headline: `${integrity.level[0].toUpperCase()}${integrity.level.slice(1)} integrity risk, ${attention} legal authorit${attention === 1 ? "y" : "ies"} needing attention, ${findings.length} gap${findings.length === 1 ? "" : "s"} to close`,
    assessment: `Integrity score ${integrity.score}/100 (${integrity.level}). ${findings.length} gap(s) were found, ${high} of them high severity. ${legal.counts.verified} legal authorit${legal.counts.verified === 1 ? "y was" : "ies were"} verified and ${legal.counts.unverified} could not be verified. This is a deterministic summary; ${aiEnabled ? "AI review was unavailable" : "AI processing is off"}. Indicators need editorial judgement and are not proof of misconduct.`,
    gaps,
    needs,
    questionsForAuthors: questions,
    strengths: strengths.slice(0, REVIEW_CONFIG.maxStrengths),
  };
}

function textArray(value: unknown, max: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new InvalidAnswer("Expected a string array");
  return value.map((item) => item.trim().slice(0, 400)).filter(Boolean).slice(0, max);
}

const lower = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : value);

export function validateReview(text: string, knownFindingIds: Set<string>): Review {
  let value: unknown;
  try {
    value = JSON.parse(stripFences(text));
  } catch {
    throw new InvalidAnswer("Invalid JSON");
  }
  if (typeof value !== "object" || value === null) throw new InvalidAnswer("Expected an object");
  const v = value as Record<string, unknown>;
  if (typeof v.headline !== "string" || !v.headline.trim() || typeof v.assessment !== "string" || !v.assessment.trim() || !Array.isArray(v.gaps)) {
    throw new InvalidAnswer("Invalid review shape");
  }
  const gaps: ReviewGap[] = v.gaps.slice(0, REVIEW_CONFIG.maxGaps).map((item: unknown) => {
    const gap = item as Record<string, unknown> | null;
    const severity = lower(gap?.severity);
    const area = lower(gap?.area);
    const findingIds = gap?.findingIds ?? [];
    if (
      !gap || typeof gap.title !== "string" || typeof gap.whatIsMissing !== "string" || typeof gap.whyItMatters !== "string" || typeof gap.howToFix !== "string" ||
      !SEVERITIES.includes(severity as Severity) || !AREAS.includes(area as FindingArea) || !Array.isArray(findingIds) || !findingIds.every((id) => typeof id === "string")
    ) {
      throw new InvalidAnswer("Invalid gap shape");
    }
    return {
      title: gap.title.slice(0, 160),
      severity: severity as Severity,
      area: area as FindingArea,
      whatIsMissing: gap.whatIsMissing.slice(0, 500),
      whyItMatters: gap.whyItMatters.slice(0, 500),
      howToFix: gap.howToFix.slice(0, 500),
      findingIds: (findingIds as string[]).filter((id) => knownFindingIds.has(id)),
    };
  });
  return {
    headline: clampWords(v.headline, REVIEW_CONFIG.maxHeadlineWords),
    assessment: clampWords(v.assessment, REVIEW_CONFIG.maxAssessmentWords),
    gaps,
    needs: textArray(v.needs, REVIEW_CONFIG.maxNeeds),
    questionsForAuthors: textArray(v.questionsForAuthors, REVIEW_CONFIG.maxQuestions),
    strengths: textArray(v.strengths, REVIEW_CONFIG.maxStrengths),
  };
}

/** AI-written gaps & needs grounded in computed findings. Falls back to a deterministic review. */
export async function reviewAnalysis(analysisId: string, allowAi = false): Promise<ReviewResponse | undefined> {
  const entry = getAnalysis(analysisId);
  if (!entry) return undefined;
  if (!allowAi) return { analysisId, review: fallbackReview(entry.result, false), source: "local" };
  if (!entry.review) {
    entry.pendingReview ??= (async () => {
      const known = new Set(entry.result.findings.map((finding) => finding.id));
      const answer = await askClaude({
        system: REVIEW_PROMPT,
        messages: [{ role: "user", content: JSON.stringify(buildEvidencePacket(entry)) }],
        maxTokens: REVIEW_CONFIG.maxTokens,
        validate: (text) => validateReview(text, known),
        retries: 1,
      });
      return answer ? { value: answer, source: "claude" as const } : { value: fallbackReview(entry.result), source: "fallback" as const };
    })();
    try {
      const outcome = await entry.pendingReview;
      // Only genuine AI answers are cached; a fallback is retried on the next request.
      if (outcome.source === "claude") entry.review = outcome;
      return { analysisId, review: outcome.value, source: outcome.source };
    } finally {
      entry.pendingReview = undefined;
    }
  }
  return { analysisId, review: entry.review.value, source: entry.review.source };
}

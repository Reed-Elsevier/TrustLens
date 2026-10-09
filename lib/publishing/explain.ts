import { EXPLAIN_CONFIG } from "@/lib/publishing/config";
import { getClaudeClient, getClaudeModel } from "@/lib/claude";
import { EXPLAIN_SYSTEM_PROMPT } from "@/lib/publishing/prompts";
import { getManuscriptDetail, type RiskDetail, type RiskLevel } from "@/lib/publishing/risk";

export interface ExplanationKeyFinding {
  signal: string;
  evidence: string;
  whyItMatters: string;
}

export interface Explanation {
  summary: string;
  keyFindings: ExplanationKeyFinding[];
  caveats: string[];
  suggestedNextSteps: string[];
}

export interface ExplainResult {
  manuscriptId: string;
  totalScore: number;
  level: RiskLevel;
  explanation: Explanation;
  source: "claude" | "fallback";
  model: string;
  evidenceUsed: unknown;
}

declare global {
  var __trustlensExplainCache: Map<string, ExplainResult> | undefined;
}

function getCache(): Map<string, ExplainResult> {
  if (!globalThis.__trustlensExplainCache) {
    globalThis.__trustlensExplainCache = new Map();
  }
  return globalThis.__trustlensExplainCache;
}

/**
 * Evidence packet for Claude, built directly from the Feature B detail
 * (no duplicated scoring logic). Uses author/editor IDs, not personal names.
 */
export function buildEvidencePacket(detail: RiskDetail) {
  return {
    manuscriptId: detail.manuscript.manuscriptId,
    manuscript: {
      journalId: detail.manuscript.journalId,
      articleType: detail.manuscript.articleType,
      subjectArea: detail.manuscript.subjectArea,
      topic: detail.manuscript.topic,
      submittedAt: detail.manuscript.submittedAt,
      finalDecision: detail.manuscript.finalDecision,
      revisionRounds: detail.manuscript.revisionRounds,
      turnaroundDays: detail.manuscript.turnaroundDays,
      similarityScorePct: detail.manuscript.similarityScorePct,
    },
    correspondingAuthorId: detail.correspondingAuthor?.authorId ?? null,
    correspondingAuthorContext: detail.correspondingAuthor
      ? { country: detail.correspondingAuthor.country, institutionTier: detail.correspondingAuthor.researchTier, hIndex: detail.correspondingAuthor.hIndex }
      : null,
    handlingEditorId: detail.handlingEditor?.authorId ?? null,
    totalScore: detail.totalScore,
    level: detail.level,
    signals: detail.signals,
    reviews: detail.reviews,
    ringPartnerCount: detail.ringPartners.length,
    ringPartners: detail.ringPartners.map((p) => ({
      a: p.a,
      b: p.b,
      totalReciprocalReviews: p.totalReciprocalReviews,
      speedRatio: p.speedRatio,
    })),
    publishedPaper: detail.publishedPaper,
    existingFlags: detail.existingFlags,
  };
}

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

class InvalidExplanationError extends Error {}

function validateExplanation(value: unknown): Explanation {
  if (typeof value !== "object" || value === null) throw new InvalidExplanationError("Explanation is not an object");
  const v = value as Record<string, unknown>;
  if (typeof v.summary !== "string") throw new InvalidExplanationError("summary must be a string");
  const wordCount = v.summary.trim() === "" ? 0 : v.summary.trim().split(/\s+/).length;
  if (wordCount > EXPLAIN_CONFIG.maxSummaryWords) throw new InvalidExplanationError("summary exceeds the word limit");
  if (!Array.isArray(v.keyFindings)) throw new InvalidExplanationError("keyFindings must be an array");
  for (const finding of v.keyFindings) {
    if (
      typeof finding !== "object" ||
      finding === null ||
      typeof (finding as Record<string, unknown>).signal !== "string" ||
      typeof (finding as Record<string, unknown>).evidence !== "string" ||
      typeof (finding as Record<string, unknown>).whyItMatters !== "string"
    ) {
      throw new InvalidExplanationError("Each keyFinding must have string signal, evidence, whyItMatters");
    }
  }
  if (!isStringArray(v.caveats)) throw new InvalidExplanationError("caveats must be a string array");
  if (!isStringArray(v.suggestedNextSteps)) throw new InvalidExplanationError("suggestedNextSteps must be a string array");
  return {
    summary: v.summary,
    keyFindings: v.keyFindings as ExplanationKeyFinding[],
    caveats: v.caveats,
    suggestedNextSteps: v.suggestedNextSteps,
  };
}

async function callClaudeOnce(packet: unknown, signal: AbortSignal, deadline: number): Promise<Explanation> {
  signal.throwIfAborted();
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new Error("Explanation budget exhausted");
  const client = getClaudeClient();
  const model = getClaudeModel();

  const response = await client.messages.create({
    model,
    max_tokens: EXPLAIN_CONFIG.maxTokens,
    system: EXPLAIN_SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(packet) }],
  }, { signal, timeout: remainingMs, maxRetries: 0 });
  signal.throwIfAborted();
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new InvalidExplanationError("Claude response had no text content");
  const cleaned = stripCodeFences(textBlock.text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new InvalidExplanationError("Claude response is not valid JSON");
  }
  return validateExplanation(parsed);
}

function buildFallbackExplanation(detail: RiskDetail): Explanation {
  const applicableSignals = detail.signals.filter((s) => s.applicable);
  const topSignals = [...applicableSignals].sort((a, b) => b.points - a.points).slice(0, 3);

  return {
    summary: `Manuscript ${detail.manuscript.manuscriptId} scored ${detail.totalScore}/100 (${detail.level} risk) from ${applicableSignals.length} applicable signal(s). This is a deterministic fallback summary, not a Claude-generated explanation.`,
    keyFindings: topSignals.map((s) => ({
      signal: s.key,
      evidence: s.evidence,
      whyItMatters: `Contributed ${s.points}/${s.maxPoints} points to the risk score.`,
    })),
    caveats: [
      "This explanation was generated deterministically from signal evidence because Claude was unavailable or returned an invalid response.",
      "A high score reflects statistical signals, not proof of misconduct.",
    ],
    suggestedNextSteps: ["Have an editor manually review the listed signals and evidence.", "Retry the explain endpoint once Claude access is restored."],
  };
}

export async function explainManuscript(manuscriptId: string): Promise<ExplainResult | undefined> {
  const deadline = Date.now() + EXPLAIN_CONFIG.timeoutMs;
  const cache = getCache();
  const cached = cache.get(manuscriptId);
  if (cached) return cached;

  const detail = getManuscriptDetail(manuscriptId);
  if (!detail) return undefined;

  const packet = buildEvidencePacket(detail);
  const model = getClaudeModel();

  let explanation: Explanation | undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(0, deadline - Date.now()));
  try {
    for (let attempt = 0; attempt <= EXPLAIN_CONFIG.maxRetries; attempt++) {
      try {
        explanation = await callClaudeOnce(packet, controller.signal, deadline);
        break;
      } catch (err) {
        if (controller.signal.aborted || !(err instanceof InvalidExplanationError) || attempt === EXPLAIN_CONFIG.maxRetries) {
          console.error(`[publishing] Claude explain unavailable or invalid for ${manuscriptId}; using fallback`);
          break;
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }

  if (explanation) {
    const result: ExplainResult = {
      manuscriptId,
      totalScore: detail.totalScore,
      level: detail.level,
      explanation,
      source: "claude",
      model,
      evidenceUsed: packet,
    };
    cache.set(manuscriptId, result);
    return result;
  }

  return {
    manuscriptId,
    totalScore: detail.totalScore,
    level: detail.level,
    explanation: buildFallbackExplanation(detail),
    source: "fallback",
    model,
    evidenceUsed: packet,
  };
}

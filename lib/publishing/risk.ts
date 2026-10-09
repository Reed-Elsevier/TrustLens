import {
  getAllCompletedReviews,
  getAllManuscripts,
  getAuthorById,
  getFlagsByManuscriptId,
  getInstitutionById,
  getManuscriptById,
  getPaperByManuscriptId,
  getReviewsForManuscriptWithDays,
  type CompletedReviewRow,
  type ManuscriptRow,
  type ReviewRow,
} from "@/lib/publishing/queries";
import { isPositiveRecommendation, RISK_LEVEL_CUTOFFS, RISK_SIGNAL_MAX_POINTS, RISK_SUB_SIGNAL_POINTS } from "@/lib/publishing/config";
import { clamp, summarize } from "@/lib/publishing/stats";
import { getRingPairs, resetRingsCache, type RingPair } from "@/lib/publishing/rings";
import { logDuration } from "@/lib/publishing/http";

export type RiskLevel = "high" | "medium" | "low";

export interface RiskSignal {
  key: keyof typeof RISK_SIGNAL_MAX_POINTS;
  label: string;
  points: number;
  maxPoints: number;
  applicable: boolean;
  evidence: string;
}

export interface RiskScore {
  manuscriptId: string;
  totalScore: number;
  breakdownSum: number;
  applicableMaxPoints: number;
  level: RiskLevel;
  signals: RiskSignal[];
  topSignals: string[];
}

interface Thresholds {
  simP75: number | null;
  simP95: number | null;
  acceptedTurnaroundP10: number | null;
  includeZeroRevisionSubSignal: boolean;
  acceptedZeroRevisionShare: number;
  editorAuthorThreshold: number;
  reviewDaysP10: number | null;
  wordCountP10: number | null;
  qualityScoreP10: number | null;
  highCutoff: number;
  mediumCutoff: number;
}

interface RiskIndex {
  computedAt: number;
  thresholds: Thresholds;
  scores: Map<string, RiskScore>;
}

declare global {
  var __trustlensRiskIndex: RiskIndex | undefined;
}

function buildRingLookup(pairs: RingPair[]): Map<string, { partner: string; minCount: number }[]> {
  const lookup = new Map<string, { partner: string; minCount: number }[]>();
  for (const pair of pairs) {
    const minCount = Math.min(pair.a_reviews_b, pair.b_reviews_a);
    if (!lookup.has(pair.a)) lookup.set(pair.a, []);
    lookup.get(pair.a)!.push({ partner: pair.b, minCount });
    if (!lookup.has(pair.b)) lookup.set(pair.b, []);
    lookup.get(pair.b)!.push({ partner: pair.a, minCount });
  }
  return lookup;
}

function computeTextSimilarity(manuscript: ManuscriptRow, t: Thresholds): RiskSignal {
  const max = RISK_SIGNAL_MAX_POINTS.textSimilarity;
  const score = manuscript.similarity_score_pct;
  if (score === null || t.simP75 === null || t.simP95 === null) {
    return { key: "textSimilarity", label: "Text similarity", points: 0, maxPoints: max, applicable: false, evidence: "similarity_score_pct is NULL" };
  }
  const range = t.simP95 - t.simP75;
  const ratio = range > 0 ? clamp((score - t.simP75) / range, 0, 1) : score > t.simP75 ? 1 : 0;
  const points = Math.round(max * ratio * 100) / 100;
  return {
    key: "textSimilarity",
    label: "Text similarity",
    points,
    maxPoints: max,
    applicable: true,
    evidence: `similarity ${score.toFixed(1)}% vs p75 ${t.simP75.toFixed(1)}% / p95 ${t.simP95.toFixed(1)}%`,
  };
}

function computeFastTrackAcceptance(manuscript: ManuscriptRow, t: Thresholds): RiskSignal {
  const max = RISK_SIGNAL_MAX_POINTS.fastTrackAcceptance;
  if (manuscript.final_decision !== "Accepted") {
    return { key: "fastTrackAcceptance", label: "Fast-track acceptance", points: 0, maxPoints: max, applicable: false, evidence: "final_decision is not Accepted" };
  }
  const weights = RISK_SUB_SIGNAL_POINTS.fastTrackAcceptance;
  const turnaroundPoints = t.includeZeroRevisionSubSignal ? weights.turnaround : max;
  const evidenceParts = [
    `turnaround ${manuscript.turnaround_days ?? "NULL"} days vs accepted p10 threshold ${t.acceptedTurnaroundP10 ?? "unavailable"} days`,
    `revision rounds ${manuscript.revision_rounds ?? "NULL"} vs zero-revision threshold 0; accepted zero-revision share ${(t.acceptedZeroRevisionShare * 100).toFixed(1)}% vs inclusion threshold 50%`,
  ];
  let points = 0;
  const fastTurnaround = t.acceptedTurnaroundP10 !== null && manuscript.turnaround_days !== null && manuscript.turnaround_days <= t.acceptedTurnaroundP10;
  if (fastTurnaround) {
    points += turnaroundPoints;
  }
  if (t.includeZeroRevisionSubSignal) {
    if (manuscript.revision_rounds === 0) {
      points += weights.zeroRevisions;
    }
  }
  return { key: "fastTrackAcceptance", label: "Fast-track acceptance", points, maxPoints: max, applicable: true, evidence: evidenceParts.join("; ") };
}

function computeReviewerRing(
  manuscript: ManuscriptRow,
  reviews: ReviewRow[],
  ringLookup: Map<string, { partner: string; minCount: number }[]>
): RiskSignal {
  const max = RISK_SIGNAL_MAX_POINTS.reviewerRing;
  const author = manuscript.corresponding_author_id;
  if (!author) {
    return { key: "reviewerRing", label: "Reviewer ring", points: 0, maxPoints: max, applicable: false, evidence: "no corresponding author" };
  }
  const partners = ringLookup.get(author) ?? [];
  const reviewerIds = new Set(reviews.filter((r) => r.review_submitted_at !== null).map((r) => r.reviewer_author_id));
  const matched = partners.filter((p) => reviewerIds.has(p.partner));
  const minCount = matched.length > 0 ? Math.max(...matched.map((p) => p.minCount)) : 0;
  const evidence = `author has ${partners.length} ring partner(s); ${matched.length} matched among ${reviewerIds.size} completed reviewer(s) vs threshold 1 matched partner; best reciprocal minimum ${minCount} vs pair threshold 1 / repeated-pair threshold 2`;
  if (matched.length === 0) {
    return { key: "reviewerRing", label: "Reviewer ring", points: 0, maxPoints: max, applicable: true, evidence };
  }
  const best = matched.reduce((acc, p) => (p.minCount > acc.minCount ? p : acc), matched[0]);
  const weights = RISK_SUB_SIGNAL_POINTS.reviewerRing;
  let points: number = weights.reciprocal;
  if (best.minCount >= 2) {
    points += weights.repeated;
  }
  return { key: "reviewerRing", label: "Reviewer ring", points, maxPoints: max, applicable: true, evidence: `${evidence}; strongest reviewer ${best.partner}` };
}

function computeEditorConcentration(manuscript: ManuscriptRow, t: Thresholds, editorAuthorCounts: Map<string, number>): RiskSignal {
  const max = RISK_SIGNAL_MAX_POINTS.editorConcentration;
  if (!manuscript.handling_editor_author_id || !manuscript.corresponding_author_id) {
    return { key: "editorConcentration", label: "Editor concentration", points: 0, maxPoints: max, applicable: false, evidence: "no handling editor on record" };
  }
  const key = `${manuscript.handling_editor_author_id}|${manuscript.corresponding_author_id}`;
  const n = editorAuthorCounts.get(key) ?? 0;
  const points = n >= t.editorAuthorThreshold ? max : 0;
  return {
    key: "editorConcentration",
    label: "Editor concentration",
    points,
    maxPoints: max,
    applicable: true,
    evidence: `editor handled ${n} manuscript(s) for this author vs threshold ${t.editorAuthorThreshold}`,
  };
}

function computeReviewBehaviour(reviews: CompletedReviewRow[], t: Thresholds): RiskSignal {
  const max = RISK_SIGNAL_MAX_POINTS.reviewBehaviour;
  if (reviews.length === 0) {
    return { key: "reviewBehaviour", label: "Review behaviour", points: 0, maxPoints: max, applicable: false, evidence: "no completed reviews" };
  }
  const weights = RISK_SUB_SIGNAL_POINTS.reviewBehaviour;
  let best = { points: -1, evidence: "" };
  for (const r of reviews) {
    let points = 0;
    const positive = isPositiveRecommendation(r.recommendation);
    const parts = [
      `${reviews.length} completed review(s); selected assignment ${r.assignment_id}`,
      `review days ${r.review_days ?? "NULL"} vs p10 threshold ${t.reviewDaysP10 ?? "unavailable"}`,
      `word count ${r.review_word_count ?? "NULL"} vs p10 threshold ${t.wordCountP10 ?? "unavailable"}`,
      `positive recommendation ${positive ? 1 : 0} (${r.recommendation ?? "NULL"}) vs threshold 1`,
      `quality score ${r.review_quality_score ?? "NULL"} vs p10 threshold ${t.qualityScoreP10 ?? "unavailable"}`,
    ];
    if (t.reviewDaysP10 !== null && r.review_days !== null && r.review_days <= t.reviewDaysP10) {
      points += weights.fast;
    }
    if (t.wordCountP10 !== null && r.review_word_count !== null && r.review_word_count <= t.wordCountP10) {
      points += weights.short;
    }
    if (positive) {
      points += weights.positive;
    }
    if (t.qualityScoreP10 !== null && r.review_quality_score !== null && r.review_quality_score <= t.qualityScoreP10) {
      points += weights.lowQuality;
    }
    if (points > best.points) {
      best = { points, evidence: parts.join("; ") };
    }
  }
  return { key: "reviewBehaviour", label: "Review behaviour", points: best.points, maxPoints: max, applicable: true, evidence: best.evidence };
}

function levelFor(total: number, t: Thresholds): RiskLevel {
  if (total >= t.highCutoff) return "high";
  if (total >= t.mediumCutoff) return "medium";
  return "low";
}

function computeThresholds(manuscripts: ManuscriptRow[], completedReviews: CompletedReviewRow[]): Thresholds {
  const similarities = manuscripts.map((m) => m.similarity_score_pct).filter((v): v is number => v !== null);
  const simDist = summarize(similarities);

  const accepted = manuscripts.filter((m) => m.final_decision === "Accepted");
  const acceptedTurnaround = accepted.map((m) => m.turnaround_days).filter((v): v is number => v !== null);
  const acceptedTurnaroundDist = summarize(acceptedTurnaround);
  const zeroRevCount = accepted.filter((m) => m.revision_rounds === 0).length;
  const zeroRevShare = accepted.length > 0 ? zeroRevCount / accepted.length : 0;

  const editorAuthorCounts = new Map<string, number>();
  for (const m of manuscripts) {
    if (!m.handling_editor_author_id || !m.corresponding_author_id) continue;
    const key = `${m.handling_editor_author_id}|${m.corresponding_author_id}`;
    editorAuthorCounts.set(key, (editorAuthorCounts.get(key) ?? 0) + 1);
  }
  const editorAuthorDist = summarize([...editorAuthorCounts.values()]);
  const editorAuthorThreshold = Math.max(3, editorAuthorDist.p95 ?? 3);

  const reviewDays = completedReviews.map((r) => r.review_days).filter((v): v is number => v !== null && !Number.isNaN(v));
  const wordCounts = completedReviews.map((r) => r.review_word_count).filter((v): v is number => v !== null);
  const qualityScores = completedReviews.map((r) => r.review_quality_score).filter((v): v is number => v !== null);
  const reviewDaysDist = summarize(reviewDays);
  const wordCountDist = summarize(wordCounts);
  const qualityScoreDist = summarize(qualityScores);

  return {
    simP75: simDist.p75,
    simP95: simDist.p95,
    acceptedTurnaroundP10: acceptedTurnaroundDist.p10,
    includeZeroRevisionSubSignal: zeroRevShare < 0.5,
    acceptedZeroRevisionShare: zeroRevShare,
    editorAuthorThreshold,
    reviewDaysP10: reviewDaysDist.p10,
    wordCountP10: wordCountDist.p10,
    qualityScoreP10: qualityScoreDist.p10,
    highCutoff: RISK_LEVEL_CUTOFFS.high,
    mediumCutoff: RISK_LEVEL_CUTOFFS.medium,
  };
}

function buildIndex(): RiskIndex {
  const startedAt = Date.now();
  const manuscripts = getAllManuscripts();
  const completedReviews = getAllCompletedReviews();
  const completedReviewsByManuscript = new Map<string, CompletedReviewRow[]>();
  for (const r of completedReviews) {
    if (!completedReviewsByManuscript.has(r.manuscript_id)) completedReviewsByManuscript.set(r.manuscript_id, []);
    completedReviewsByManuscript.get(r.manuscript_id)!.push(r);
  }

  const thresholds = computeThresholds(manuscripts, completedReviews);
  const { pairs } = getRingPairs(1);
  const ringLookup = buildRingLookup(pairs);

  const editorAuthorCounts = new Map<string, number>();
  for (const m of manuscripts) {
    if (!m.handling_editor_author_id || !m.corresponding_author_id) continue;
    const key = `${m.handling_editor_author_id}|${m.corresponding_author_id}`;
    editorAuthorCounts.set(key, (editorAuthorCounts.get(key) ?? 0) + 1);
  }

  const rawScores: { manuscriptId: string; total: number; signals: RiskSignal[] }[] = [];
  for (const m of manuscripts) {
    // reviewerRing only cares which reviewers completed a review, so the
    // completed-reviews list doubles as the "reviews" input for that signal.
    const completed = completedReviewsByManuscript.get(m.manuscript_id) ?? [];
    const signals = [
      computeTextSimilarity(m, thresholds),
      computeFastTrackAcceptance(m, thresholds),
      computeReviewerRing(m, completed, ringLookup),
      computeEditorConcentration(m, thresholds, editorAuthorCounts),
      computeReviewBehaviour(completed, thresholds),
    ];
    const total = Math.round(signals.reduce((sum, s) => sum + s.points, 0) * 100) / 100;
    rawScores.push({ manuscriptId: m.manuscript_id, total, signals });
  }

  const scores = new Map<string, RiskScore>();
  for (const { manuscriptId, total, signals } of rawScores) {
    const level = levelFor(total, thresholds);
    const applicableMaxPoints = signals.filter((s) => s.applicable).reduce((sum, s) => sum + s.maxPoints, 0);
    const topSignals = [...signals]
      .sort((a, b) => b.points - a.points)
      .slice(0, 3)
      .map((s) => s.key);
    scores.set(manuscriptId, {
      manuscriptId,
      totalScore: total,
      breakdownSum: total,
      applicableMaxPoints,
      level,
      signals,
      topSignals,
    });
  }

  logDuration("risk index warm-up", startedAt);
  return { computedAt: Date.now(), thresholds, scores };
}

export function getRiskIndex(refresh = false): RiskIndex {
  if (refresh) resetRingsCache();
  if (refresh || !globalThis.__trustlensRiskIndex) {
    globalThis.__trustlensRiskIndex = buildIndex();
  }
  return globalThis.__trustlensRiskIndex;
}

export interface RiskListFilters {
  limit: number;
  offset: number;
  level?: RiskLevel;
  topic?: string;
  subjectArea?: string;
  minScore?: number;
  flagged?: boolean;
}

export interface RiskListItem {
  manuscriptId: string;
  journalId: string | null;
  subjectArea: string | null;
  topic: string | null;
  finalDecision: string | null;
  totalScore: number;
  level: RiskLevel;
  topSignals: string[];
  hasExistingFlag: boolean;
  flagStatuses: string[];
}

export function listRisk(filters: RiskListFilters, refresh = false): { items: RiskListItem[]; total: number; thresholds: Thresholds } {
  const { scores, thresholds } = getRiskIndex(refresh);
  const manuscripts = getAllManuscripts();
  const manuscriptById = new Map(manuscripts.map((m) => [m.manuscript_id, m]));

  const items: RiskListItem[] = [];
  for (const [manuscriptId, score] of scores) {
    const m = manuscriptById.get(manuscriptId);
    if (!m) continue;
    if (filters.level && score.level !== filters.level) continue;
    if (filters.topic && m.topic !== filters.topic) continue;
    if (filters.subjectArea && m.subject_area !== filters.subjectArea) continue;
    if (filters.minScore !== undefined && score.totalScore < filters.minScore) continue;

    const flags = getFlagsByManuscriptId(manuscriptId);
    const hasExistingFlag = flags.length > 0;
    if (filters.flagged !== undefined && hasExistingFlag !== filters.flagged) continue;

    items.push({
      manuscriptId,
      journalId: m.journal_id,
      subjectArea: m.subject_area,
      topic: m.topic,
      finalDecision: m.final_decision,
      totalScore: score.totalScore,
      level: score.level,
      topSignals: score.topSignals,
      hasExistingFlag,
      flagStatuses: flags.map((f) => f.status).filter((s): s is string => s !== null),
    });
  }

  items.sort((a, b) => (b.totalScore !== a.totalScore ? b.totalScore - a.totalScore : a.manuscriptId.localeCompare(b.manuscriptId)));
  const total = items.length;
  const page = items.slice(filters.offset, filters.offset + filters.limit);
  return { items: page, total, thresholds };
}

export interface RiskDetail {
  manuscript: {
    manuscriptId: string;
    journalId: string | null;
    articleType: string | null;
    subjectArea: string | null;
    topic: string | null;
    submittedAt: string | null;
    firstDecisionAt: string | null;
    finalDecisionAt: string | null;
    finalDecision: string | null;
    revisionRounds: number | null;
    turnaroundDays: number | null;
    similarityScorePct: number | null;
  };
  correspondingAuthor: PersonInfo | null;
  handlingEditor: PersonInfo | null;
  totalScore: number;
  level: RiskLevel;
  breakdownSum: number;
  applicableMaxPoints: number;
  signals: RiskSignal[];
  reviews: {
    reviewerAuthorId: string;
    reviewDays: number | null;
    wordCount: number | null;
    recommendation: string | null;
    qualityScore: number | null;
  }[];
  ringPartners: RingPair[];
  publishedPaper: { paperId: string; title: string | null; topic: string | null; citationCount: number | null } | null;
  existingFlags: { flagId: string; flagType: string | null; status: string | null; detectedBy: string | null; evidenceSummary: string | null }[];
}

interface PersonInfo {
  authorId: string;
  fullName: string | null;
  country: string | null;
  institutionName: string | null;
  researchTier: string | null;
  hIndex: number | null;
}

function toPersonInfo(authorId: string | null): PersonInfo | null {
  if (!authorId) return null;
  const author = getAuthorById(authorId);
  if (!author) return { authorId, fullName: null, country: null, institutionName: null, researchTier: null, hIndex: null };
  const institution = getInstitutionById(author.primary_institution_id);
  return {
    authorId,
    fullName: author.full_name,
    country: author.country,
    institutionName: institution?.institution_name ?? null,
    researchTier: institution?.research_tier ?? null,
    hIndex: author.h_index,
  };
}

export function getManuscriptDetail(manuscriptId: string, refresh = false): RiskDetail | undefined {
  const manuscript = getManuscriptById(manuscriptId);
  if (!manuscript) return undefined;

  const { scores } = getRiskIndex(refresh);
  const score = scores.get(manuscriptId);
  if (!score) return undefined;

  const reviewRows = getReviewsForManuscriptWithDays(manuscriptId);
  const completedReviewerIds = new Set(reviewRows.filter((r) => r.review_submitted_at !== null).map((r) => r.reviewer_author_id));
  const reviews = reviewRows.map((r) => ({
    reviewerAuthorId: r.reviewer_author_id,
    reviewDays: r.review_days,
    wordCount: r.review_word_count,
    recommendation: r.recommendation,
    qualityScore: r.review_quality_score,
  }));

  const { pairs } = getRingPairs(1);
  const ringPartners = pairs.filter((p) =>
    (p.a === manuscript.corresponding_author_id && completedReviewerIds.has(p.b)) ||
    (p.b === manuscript.corresponding_author_id && completedReviewerIds.has(p.a))
  );

  const paper = getPaperByManuscriptId(manuscriptId);
  const flags = getFlagsByManuscriptId(manuscriptId);

  return {
    manuscript: {
      manuscriptId: manuscript.manuscript_id,
      journalId: manuscript.journal_id,
      articleType: manuscript.article_type,
      subjectArea: manuscript.subject_area,
      topic: manuscript.topic,
      submittedAt: manuscript.submitted_at,
      firstDecisionAt: manuscript.first_decision_at,
      finalDecisionAt: manuscript.final_decision_at,
      finalDecision: manuscript.final_decision,
      revisionRounds: manuscript.revision_rounds,
      turnaroundDays: manuscript.turnaround_days,
      similarityScorePct: manuscript.similarity_score_pct,
    },
    correspondingAuthor: toPersonInfo(manuscript.corresponding_author_id),
    handlingEditor: toPersonInfo(manuscript.handling_editor_author_id),
    totalScore: score.totalScore,
    level: score.level,
    breakdownSum: score.breakdownSum,
    applicableMaxPoints: score.applicableMaxPoints,
    signals: score.signals,
    reviews,
    ringPartners,
    publishedPaper: paper ? { paperId: paper.paper_id, title: paper.title, topic: paper.topic, citationCount: paper.citation_count } : null,
    existingFlags: flags.map((f) => ({ flagId: f.flag_id, flagType: f.flag_type, status: f.status, detectedBy: f.detected_by, evidenceSummary: f.evidence_summary })),
  };
}

export function getManuscriptCount(): number {
  return getAllManuscripts().length;
}

import {
  getAllCompletedReviews,
  getAllManuscripts,
  getAuthorsByIds,
  getInstitutionsByIds,
  type AuthorRow,
  type CompletedReviewRow,
  type InstitutionRow,
  type ManuscriptRow,
} from "@/lib/publishing/queries";
import { isPositiveRecommendation } from "@/lib/publishing/config";
import { mean, percentile } from "@/lib/publishing/stats";
import { logDuration } from "@/lib/publishing/http";

export interface RingAuthorInfo {
  authorId: string;
  fullName: string | null;
  country: string | null;
  institutionName: string | null;
  researchTier: string | null;
  hIndex: number | null;
}

export interface RingManuscriptRef {
  manuscript_id: string;
  direction: "a_reviews_b" | "b_reviews_a";
}

export interface RingPair {
  a: string;
  b: string;
  a_reviews_b: number;
  b_reviews_a: number;
  totalReciprocalReviews: number;
  avgReviewDays: number | null;
  speedRatio: number | null;
  positivity: { pairShare: number | null; globalShare: number | null };
  avgWordCount: number | null;
  avgQualityScore: number | null;
  authors: { a: RingAuthorInfo; b: RingAuthorInfo };
  manuscripts: RingManuscriptRef[];
}

export interface RingGlobalStats {
  avgReviewDays: number | null;
  medianReviewDays: number | null;
  positiveShare: number | null;
  avgWordCount: number | null;
  avgQualityScore: number | null;
}

interface ReviewWithContext extends CompletedReviewRow {
  correspondingAuthorId: string | null;
}

let cache: { reviews: ReviewWithContext[]; global: RingGlobalStats } | undefined;

function loadReviewsWithContext(): ReviewWithContext[] {
  const manuscripts = getAllManuscripts();
  const manuscriptById = new Map<string, ManuscriptRow>(manuscripts.map((m) => [m.manuscript_id, m]));
  const reviews = getAllCompletedReviews();
  return reviews
    .map((r) => ({ ...r, correspondingAuthorId: manuscriptById.get(r.manuscript_id)?.corresponding_author_id ?? null }))
    .filter((r) => r.correspondingAuthorId !== null && r.reviewer_author_id !== r.correspondingAuthorId);
}

function computeGlobalStats(reviews: ReviewWithContext[]): RingGlobalStats {
  const days = reviews.map((r) => r.review_days).filter((d): d is number => d !== null && !Number.isNaN(d));
  const wordCounts = reviews.map((r) => r.review_word_count).filter((w): w is number => w !== null);
  const qualityScores = reviews.map((r) => r.review_quality_score).filter((q): q is number => q !== null);
  const withRecommendation = reviews.filter((r) => r.recommendation !== null);
  const positiveShare =
    withRecommendation.length > 0
      ? withRecommendation.filter((r) => isPositiveRecommendation(r.recommendation)).length / withRecommendation.length
      : null;
  return {
    avgReviewDays: mean(days),
    medianReviewDays: days.length > 0 ? percentile([...days].sort((a, b) => a - b), 50) : null,
    positiveShare,
    avgWordCount: mean(wordCounts),
    avgQualityScore: mean(qualityScores),
  };
}

function getCache() {
  if (!cache) {
    const startedAt = Date.now();
    const reviews = loadReviewsWithContext();
    cache = { reviews, global: computeGlobalStats(reviews) };
    logDuration("ring cache warm-up", startedAt);
  }
  return cache;
}

function buildAuthorInfo(authorId: string, authors: Map<string, AuthorRow>, institutions: Map<string, InstitutionRow>): RingAuthorInfo {
  const author = authors.get(authorId);
  const institution = author?.primary_institution_id ? institutions.get(author.primary_institution_id) : undefined;
  return {
    authorId,
    fullName: author?.full_name ?? null,
    country: author?.country ?? null,
    institutionName: institution?.institution_name ?? null,
    researchTier: institution?.research_tier ?? null,
    hIndex: author?.h_index ?? null,
  };
}

function summarizePairReviews(pairReviews: ReviewWithContext[], global: RingGlobalStats) {
  const days = pairReviews.map((r) => r.review_days).filter((d): d is number => d !== null && !Number.isNaN(d));
  const wordCounts = pairReviews.map((r) => r.review_word_count).filter((w): w is number => w !== null);
  const qualityScores = pairReviews.map((r) => r.review_quality_score).filter((q): q is number => q !== null);
  const withRecommendation = pairReviews.filter((r) => r.recommendation !== null);
  const pairShare =
    withRecommendation.length > 0
      ? withRecommendation.filter((r) => isPositiveRecommendation(r.recommendation)).length / withRecommendation.length
      : null;
  const avgReviewDays = mean(days);
  return {
    avgReviewDays,
    speedRatio: avgReviewDays !== null && global.medianReviewDays ? avgReviewDays / global.medianReviewDays : null,
    positivity: { pairShare, globalShare: global.positiveShare },
    avgWordCount: mean(wordCounts),
    avgQualityScore: mean(qualityScores),
  };
}

export function getRingPairs(minEach: number): { pairs: RingPair[]; global: RingGlobalStats } {
  const { reviews, global } = getCache();

  const directed = new Map<string, ReviewWithContext[]>();
  for (const r of reviews) {
    const key = `${r.reviewer_author_id}|${r.correspondingAuthorId}`;
    if (!directed.has(key)) directed.set(key, []);
    directed.get(key)!.push(r);
  }

  const seenPairs = new Set<string>();
  const pairs: RingPair[] = [];
  const neededAuthorIds = new Set<string>();

  for (const key of directed.keys()) {
    const [reviewer, author] = key.split("|");
    const pairKey = [reviewer, author].sort().join("|");
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const forward = directed.get(`${reviewer}|${author}`) ?? [];
    const back = directed.get(`${author}|${reviewer}`) ?? [];
    if (forward.length < minEach || back.length < minEach) continue;

    const [a, b] = [reviewer, author].sort();
    const aReviewsB = a === reviewer ? forward : back;
    const bReviewsA = a === reviewer ? back : forward;

    const pairReviews = [...aReviewsB, ...bReviewsA];
    const stats = summarizePairReviews(pairReviews, global);

    neededAuthorIds.add(a);
    neededAuthorIds.add(b);

    pairs.push({
      a,
      b,
      a_reviews_b: aReviewsB.length,
      b_reviews_a: bReviewsA.length,
      totalReciprocalReviews: pairReviews.length,
      ...stats,
      authors: { a: {} as RingAuthorInfo, b: {} as RingAuthorInfo },
      manuscripts: [
        ...aReviewsB.map((r) => ({ manuscript_id: r.manuscript_id, direction: "a_reviews_b" as const })),
        ...bReviewsA.map((r) => ({ manuscript_id: r.manuscript_id, direction: "b_reviews_a" as const })),
      ],
    });
  }

  const authors = getAuthorsByIds([...neededAuthorIds]);
  const institutions = getInstitutionsByIds([...authors.values()].map((a) => a.primary_institution_id).filter((x): x is string => !!x));
  for (const pair of pairs) {
    pair.authors = { a: buildAuthorInfo(pair.a, authors, institutions), b: buildAuthorInfo(pair.b, authors, institutions) };
  }

  return { pairs, global };
}

export function resetRingsCache() {
  cache = undefined;
}

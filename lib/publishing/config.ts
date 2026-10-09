/**
 * Weights, level cutoffs and the positive-recommendation mapping for the
 * Publishing Integrity feature. Percentile-derived thresholds themselves are
 * NOT hard-coded here — they are computed at warm-up from the live data
 * distribution (see lib/publishing/stats.ts and lib/publishing/risk.ts).
 * Only fixed point weights and starting level cutoffs live here.
 */

/** recommendation values treated as "positive" (see docs/publishing-discovery.md for the discovered distinct values) */
export const POSITIVE_RECOMMENDATIONS = new Set(["Accept", "Minor Revision"]);

export function isPositiveRecommendation(recommendation: string | null): boolean {
  if (recommendation === null) return false;
  return POSITIVE_RECOMMENDATIONS.has(recommendation);
}

export const RING_CONFIG = {
  defaultMinEach: 1,
  minEachRange: { min: 1, max: 10 },
  limitRange: { min: 1, max: 200 },
  allowedSorts: ["totalReciprocalReviews", "speedRatio", "positivity"] as const,
};

export type RingSort = (typeof RING_CONFIG.allowedSorts)[number];

/** Max points available per risk signal (section 7 of the spec). Total = 100. */
export const RISK_SIGNAL_MAX_POINTS = {
  textSimilarity: 25,
  fastTrackAcceptance: 20,
  reviewerRing: 25,
  editorConcentration: 10,
  reviewBehaviour: 20,
} as const;

export const RISK_SUB_SIGNAL_POINTS = {
  fastTrackAcceptance: { turnaround: 12, zeroRevisions: 8 },
  reviewerRing: { reciprocal: 15, repeated: 10 },
  reviewBehaviour: { fast: 6, short: 6, positive: 4, lowQuality: 4 },
} as const;

/**
 * Starting level cutoffs. Adjusted after Step 0 shows the real score
 * distribution so that roughly the top 5% of manuscripts are "high"
 * (the final values and rationale are documented in
 * docs/publishing-discovery.md).
 */
export const RISK_LEVEL_CUTOFFS = {
  high: 50,
  medium: 25,
};

export const RISK_LIST_DEFAULTS = {
  limit: 50,
  offset: 0,
};

export const EXPLAIN_CONFIG = {
  maxTokens: 800,
  maxSummaryWords: 60,
  timeoutMs: 20_000,
  maxRetries: 1,
};

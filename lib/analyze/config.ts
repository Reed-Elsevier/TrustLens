export const UPLOAD_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxPages: 150,
  maxChars: 250_000,
  minChars: 400,
  parseTimeoutMs: 20_000,
};

export const SIMILARITY_CONFIG = {
  shingleSize: 5,
  minQueryWords: 20,
  flagCosine: 0.35,
  highCosine: 0.7,
  topMatches: 5,
};

export const PLAGIARISM_CONFIG = { shingleSize: 5, minSharedWords: 10, maxMatches: 20, excerptChars: 320 };

/** Max points per integrity signal. Total = 100. */
export const INTEGRITY_MAX_POINTS = {
  similarity: 30,
  statements: 20,
  references: 20,
  textAnomalies: 15,
  manipulation: 15,
} as const;

export const STATEMENT_POINTS = { conflict: 6, dataAvailability: 6, funding: 4, ethics: 4 } as const;

export const INTEGRITY_LEVEL_CUTOFFS = { high: 50, medium: 25 };

export const REFERENCE_CONFIG = {
  minExpected: 10,
  veryFew: 5,
  oldYears: 15,
  oldShareFlag: 0.7,
  minYearsForShare: 5,
};

export const LEGAL_RELEVANCE = { low: 3, high: 12 };

export const STORE_CONFIG = { maxEntries: 20, ttlMs: 60 * 60 * 1000 };

export const REVIEW_CONFIG = { maxTokens: 1800, maxGaps: 8, maxNeeds: 6, maxQuestions: 5, maxStrengths: 4, maxAssessmentWords: 90, maxHeadlineWords: 25 };

export const CHAT_CONFIG = { maxTokens: 700, maxHistory: 10, maxMessageChars: 1000, maxReplyWords: 180, maxPassages: 3, passageChars: 600 };

export const ANALYSIS_ID_PATTERN = /^[a-f0-9]{16}$/;

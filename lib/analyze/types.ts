export type Severity = "high" | "medium" | "low";
export type FindingArea = "integrity" | "legal" | "structure" | "references";
export type RiskLevel = "high" | "medium" | "low";
export type LegalVerdict = "good_law" | "questionable" | "overruled" | "superseded";

/** A deterministic, number-backed observation. AI text may reference findings but never creates them. */
export interface Finding {
  id: string;
  area: FindingArea;
  severity: Severity;
  title: string;
  detail: string;
  fix: string;
}

export interface SectionCheck {
  key: string;
  label: string;
  found: boolean;
}

export interface StatementCheck extends SectionCheck {
  applicable: boolean;
}

export interface ReferenceStats {
  found: boolean;
  count: number;
  citationMarkers: number;
  maxNumericMarker: number | null;
  olderShare: number | null;
  duplicates: number;
  yearRange: [number, number] | null;
}

export interface StructureReport {
  words: number;
  abstractWords: number | null;
  sections: SectionCheck[];
  statements: StatementCheck[];
  references: ReferenceStats;
  figures: number;
  tables: number;
}

export interface IntegritySignal {
  key: string;
  label: string;
  points: number;
  maxPoints: number;
  applicable: boolean;
  evidence: string;
}

export interface SimilarMatch {
  paperId: string;
  title: string | null;
  doi: string | null;
  cosine: number;
  containment: number;
}

export type AnomalyKind = "tortured_phrase" | "llm_artifact" | "reviewer_manipulation" | "placeholder" | "duplicate_text";

export interface Anomaly {
  kind: AnomalyKind;
  label: string;
  count: number;
  example: string;
}

export interface IntegrityReport {
  score: number;
  level: RiskLevel;
  signals: IntegritySignal[];
  matches: SimilarMatch[];
  anomalies: Anomaly[];
  corpusSize: number;
  comparedAgainst: "abstract" | "opening_text" | null;
}

export interface LegalAuthority {
  docId: string;
  title: string;
  docType: string;
  jurisdiction: string;
  court: string | null;
  storedStatus: string;
  verdict: LegalVerdict;
  confidence: "high" | "medium" | "low";
  statusMismatch: boolean;
  mentions: number;
  snippet: string;
  reasons: string[];
  citingCount: number;
}

export interface UnverifiedCitation {
  text: string;
  kind: "case" | "statute";
  snippet: string;
}

export interface LegalReport {
  available: boolean;
  relevance: "none" | "low" | "high";
  legalTermCount: number;
  authorities: LegalAuthority[];
  unverified: UnverifiedCitation[];
  jurisdictions: { name: string; mentions: number }[];
  counts: { verified: number; goodLaw: number; questionable: number; overruled: number; superseded: number; unverified: number };
  currencyRate: number | null;
}

export interface ReviewGap {
  title: string;
  severity: Severity;
  area: FindingArea;
  whatIsMissing: string;
  whyItMatters: string;
  howToFix: string;
  findingIds: string[];
}

export interface Review {
  headline: string;
  assessment: string;
  gaps: ReviewGap[];
  needs: string[];
  questionsForAuthors: string[];
  strengths: string[];
}

export interface ReviewResponse {
  analysisId: string;
  review: Review;
  source: "claude" | "fallback";
}

export interface AnalysisResult {
  id: string;
  notice: string;
  file: { name: string; sizeBytes: number; pages: number; words: number; truncated: boolean; title: string | null };
  structure: StructureReport;
  integrity: IntegrityReport;
  legal: LegalReport;
  findings: Finding[];
  completenessScore: number;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  reply: string;
  source: "claude" | "fallback";
  suggestions: string[];
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export const LEGAL_DOCUMENTS = {
  table: "legal_documents", doc_id: "doc_id", doc_type: "doc_type", title: "title",
  jurisdiction: "jurisdiction", court: "court", court_level: "court_level",
  decision_date: "decision_date", status: "status", summary: "summary", full_text: "full_text",
} as const;
export const LEGAL_CITATIONS = {
  table: "legal_citations", citation_id: "citation_id", citing_doc_id: "citing_doc_id",
  cited_doc_id: "cited_doc_id", treatment: "treatment", citation_date: "citation_date",
  context_snippet: "context_snippet",
} as const;
export const REGULATORY_UPDATES = {
  table: "regulatory_updates", update_id: "update_id", jurisdiction: "jurisdiction",
  published_at: "published_at", received_at: "received_at", due_at: "due_at", completed_at: "completed_at",
} as const;
export const REGULATORY_UPDATE_IMPACTS = {
  table: "regulatory_update_impacts", update_id: "update_id", doc_id: "doc_id", impact_type: "impact_type",
} as const;
export const EDITORIAL_TASKS = {
  table: "editorial_tasks", task_id: "task_id", update_id: "update_id", doc_id: "doc_id",
  doc_type: "doc_type", jurisdiction: "jurisdiction", assigned_at: "assigned_at",
  completed_at: "completed_at", classified_by: "classified_by",
  classification_correct: "classification_correct", rework_needed: "rework_needed",
} as const;
export const DOC_TYPES = ["case", "statute", "regulation"] as const;
export type DocType = (typeof DOC_TYPES)[number];
// 3 is highest; statutes and regulations have no court or court level.
export const COURT_LEVELS = [1, 2, 3] as const;
export const STATUSES = ["good_law", "overruled", "superseded"] as const;
export const TREATMENTS = ["follows", "distinguishes", "criticizes", "overrules"] as const;
export const IMPACT_TYPES = ["amends", "repeals", "supersedes"] as const;
export const CLASSIFIED_BY = ["manual", "auto"] as const;
export const ID_PATTERNS = { document: /^LD\d{5}$/, citation: /^LC\d{6}$/, update: /^RU\d{5}$/, task: /^ET\d{5}$/ };
export const DEADLINE_HOURS = 72;
export const AS_OF = "2026-10-01 00:00:00";
export const MIN_SAMPLE_DEFAULT = 20;
export const SYNTHETIC_NOTICE = "Synthetic demo data. Research support, not legal advice.";
export const AI_CONFIG = { timeoutMs: 20_000, maxTokens: 800 };
export const SIGNIFICANCE_Z = 1.96;
export const MIN_GROUP_N = 30;

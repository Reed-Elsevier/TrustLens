import { db } from "@/lib/db";

/**
 * All SQL for the Publishing Integrity feature lives here as prepared
 * statements. Every bound value is passed as a parameter; nothing from
 * request input is ever concatenated into SQL text.
 *
 * NOTE: table/column names below follow docs/SPEC-publishing.md. Run
 * `node scripts/discover-publishing.mjs` against the real hackathon.db
 * first (see docs/publishing-discovery.md) and adjust names here if the
 * live schema differs (e.g. research_papers_published vs research_paper_published).
 */

export interface ManuscriptRow {
  manuscript_id: string;
  journal_id: string | null;
  corresponding_author_id: string | null;
  handling_editor_author_id: string | null;
  ops_coordinator_employee_id: string | null;
  article_type: string | null;
  subject_area: string | null;
  topic: string | null;
  submitted_at: string | null;
  first_decision_at: string | null;
  final_decision_at: string | null;
  final_decision: string | null;
  revision_rounds: number | null;
  turnaround_days: number | null;
  similarity_score_pct: number | null;
}

export interface ReviewRow {
  assignment_id: string;
  manuscript_id: string;
  reviewer_author_id: string;
  invited_at: string | null;
  responded_at: string | null;
  response: string | null;
  due_at: string | null;
  review_submitted_at: string | null;
  is_overdue: string | null;
  recommendation: string | null;
  review_quality_score: number | null;
  review_word_count: number | null;
}

export interface CompletedReviewRow extends ReviewRow {
  review_days: number | null;
}

export interface AuthorRow {
  author_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  author_ref_id: string | null;
  country: string | null;
  primary_institution_id: string | null;
  h_index: number | null;
  first_publication_year: number | null;
  is_reviewer: string | null;
}

export interface InstitutionRow {
  institution_id: string;
  institution_name: string | null;
  institution_type: string | null;
  country: string | null;
  research_tier: string | null;
}

export interface PaperRow {
  paper_id: string;
  manuscript_id: string | null;
  journal_id: string | null;
  published_date: string | null;
  doi: string | null;
  title: string | null;
  abstract: string | null;
  keywords: string | null;
  subject_area: string | null;
  topic: string | null;
  article_type: string | null;
  open_access: string | null;
  page_count: number | null;
  downloads_total: number | null;
  citation_count: number | null;
  institution_id: string | null;
}

export interface FlagRow {
  flag_id: string;
  paper_id: string | null;
  flag_type: string | null;
  manuscript_id: string | null;
  flagged_at: string | null;
  detected_by: string | null;
  status: string | null;
  assigned_employee_id: string | null;
  evidence_summary: string | null;
}

export function getTableNames(): string[] {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
  return rows.map((r) => r.name);
}

export function getTableInfo(table: string) {
  // table names only ever come from getTableNames() above, never from request input
  return db.prepare(`PRAGMA table_info(${table})`).all();
}

export function getRowCount(table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
  return row.c;
}

export function getAllManuscripts(): ManuscriptRow[] {
  return db.prepare("SELECT * FROM manuscripts").all() as ManuscriptRow[];
}

export function getManuscriptById(manuscriptId: string): ManuscriptRow | undefined {
  return db.prepare("SELECT * FROM manuscripts WHERE manuscript_id = ?").get(manuscriptId) as ManuscriptRow | undefined;
}

export function getAllCompletedReviews(): CompletedReviewRow[] {
  return db
    .prepare(
      `SELECT *, (julianday(review_submitted_at) - julianday(invited_at)) AS review_days
       FROM peer_review_assignments
       WHERE review_submitted_at IS NOT NULL`
    )
    .all() as CompletedReviewRow[];
}

export function getReviewsForManuscript(manuscriptId: string): ReviewRow[] {
  return db
    .prepare("SELECT * FROM peer_review_assignments WHERE manuscript_id = ?")
    .all(manuscriptId) as ReviewRow[];
}

/** Same as getReviewsForManuscript, plus review_days (NULL unless the review was completed). */
export function getReviewsForManuscriptWithDays(manuscriptId: string): (ReviewRow & { review_days: number | null })[] {
  return db
    .prepare(
      `SELECT *, (julianday(review_submitted_at) - julianday(invited_at)) AS review_days
       FROM peer_review_assignments WHERE manuscript_id = ?`
    )
    .all(manuscriptId) as (ReviewRow & { review_days: number | null })[];
}

export function getAuthorById(authorId: string): AuthorRow | undefined {
  return db.prepare("SELECT * FROM authors WHERE author_id = ?").get(authorId) as AuthorRow | undefined;
}

export function getAuthorsByIds(authorIds: string[]): Map<string, AuthorRow> {
  if (authorIds.length === 0) return new Map();
  const placeholders = authorIds.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT * FROM authors WHERE author_id IN (${placeholders})`)
    .all(...authorIds) as AuthorRow[];
  return new Map(rows.map((r) => [r.author_id, r]));
}

export function getInstitutionById(institutionId: string | null): InstitutionRow | undefined {
  if (!institutionId) return undefined;
  return db.prepare("SELECT * FROM institutions WHERE institution_id = ?").get(institutionId) as InstitutionRow | undefined;
}

export function getInstitutionsByIds(institutionIds: string[]): Map<string, InstitutionRow> {
  const ids = [...new Set(institutionIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT * FROM institutions WHERE institution_id IN (${placeholders})`)
    .all(...ids) as InstitutionRow[];
  return new Map(rows.map((r) => [r.institution_id, r]));
}

export function getPaperByManuscriptId(manuscriptId: string): PaperRow | undefined {
  return db
    .prepare("SELECT * FROM research_papers_published WHERE manuscript_id = ?")
    .get(manuscriptId) as PaperRow | undefined;
}

export function getAllPapers(): PaperRow[] {
  return db.prepare("SELECT * FROM research_papers_published").all() as PaperRow[];
}

export function getFlagsByManuscriptId(manuscriptId: string): FlagRow[] {
  return db
    .prepare("SELECT * FROM research_integrity_flags WHERE manuscript_id = ?")
    .all(manuscriptId) as FlagRow[];
}

export function getAllFlags(): FlagRow[] {
  return db.prepare("SELECT * FROM research_integrity_flags").all() as FlagRow[];
}

export function getDistinctValueCounts(table: string, column: string): { value: string | null; count: number }[] {
  // table/column only ever come from the fixed discovery call sites below, never from request input
  const rows = db
    .prepare(`SELECT ${column} AS value, COUNT(*) AS count FROM ${table} GROUP BY ${column} ORDER BY count DESC`)
    .all() as { value: string | null; count: number }[];
  return rows;
}

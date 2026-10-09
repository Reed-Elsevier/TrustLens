import type Database from "better-sqlite3";
import { db } from "@/lib/db";
import {
  LEGAL_DOCUMENTS as D, LEGAL_CITATIONS as C, REGULATORY_UPDATE_IMPACTS as I,
  REGULATORY_UPDATES as U, SYNTHETIC_NOTICE, type DocType,
} from "@/lib/legal/config";
import { askLegal, InvalidLegalAnswer, stripCodeFences } from "@/lib/legal/http";
import { GOOD_LAW_PROMPT } from "@/lib/legal/prompts";

export type Verdict = "good_law" | "questionable" | "overruled" | "superseded";
type Confidence = "high" | "medium" | "low";
export interface LegalDocument {
  doc_id: string; title: string; doc_type: DocType; jurisdiction: string; court: string | null;
  court_level: number | null; decision_date: string; status: string;
}
interface Citation extends LegalDocument {
  citation_id: string; treatment: string; citation_date: string; context_snippet: string;
}
interface Impact { update_id: string; published_at: string; jurisdiction: string; impact_type: string }
interface Explanation {
  verdict: Verdict | "insufficient_evidence"; confidence: Confidence; reasoning: string;
  supportingDocIds: string[]; caveats: string[];
}
const documentColumns = Object.values(D).filter((column) => column !== D.table && column !== D.summary && column !== D.full_text);
const columns = (alias: string) => documentColumns.map((column) => `${alias}.${column}`).join(", ");

export function searchDocuments(q: string, docType: string | undefined, jurisdiction: string | undefined, limit: number, database = db): LegalDocument[] {
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  return database.prepare(`
    SELECT ${columns("d")} FROM ${D.table} d
    WHERE (d.${D.title} LIKE ? ESCAPE '\\' OR d.${D.summary} LIKE ? ESCAPE '\\')
      AND (? IS NULL OR d.${D.doc_type} = ?) AND (? IS NULL OR d.${D.jurisdiction} = ?)
    ORDER BY d.${D.title}, d.${D.doc_id} LIMIT ?
  `).all(pattern, pattern, docType ?? null, docType ?? null, jurisdiction ?? null, jurisdiction ?? null, limit) as LegalDocument[];
}

export function checkGoodLaw(docId: string, database = db) {
  const document = database.prepare(`SELECT ${columns("d")} FROM ${D.table} d WHERE d.${D.doc_id} = ?`).get(docId) as LegalDocument | undefined;
  if (!document) return undefined;
  const citations = database.prepare(`
    SELECT ${columns("d")}, c.${C.citation_id}, c.${C.treatment}, c.${C.citation_date}, c.${C.context_snippet}
    FROM ${C.table} c JOIN ${D.table} d ON d.${D.doc_id} = c.${C.citing_doc_id}
    WHERE c.${C.cited_doc_id} = ?
  `).all(docId) as Citation[];
  const impacts = database.prepare(`
    SELECT i.${I.impact_type}, u.${U.update_id}, u.${U.published_at}, u.${U.jurisdiction}
    FROM ${I.table} i JOIN ${U.table} u ON u.${U.update_id} = i.${I.update_id}
    WHERE i.${I.doc_id} = ?
  `).all(docId) as Impact[];
  // Binding requires a later same-jurisdiction case from an equal or higher court.
  const binding = citations.filter((row) => row.treatment === "overrules" && row.doc_type === "case"
    && document.doc_type === "case" && row.jurisdiction === document.jurisdiction
    && row.court_level !== null && document.court_level !== null && row.court_level >= document.court_level
    && row.decision_date > document.decision_date);
  const nonBinding = citations.filter((row) => row.treatment === "overrules" && !binding.includes(row));
  const criticisms = citations.filter((row) => row.treatment === "criticizes");
  const superseding = impacts.filter((row) => ["repeals", "supersedes"].includes(row.impact_type) && row.published_at > document.decision_date);
  // Rules alone determine the final verdict, in this order; stored status is not authority.
  const finalVerdict: Verdict = binding.length ? "overruled" : superseding.length ? "superseded"
    : nonBinding.length || criticisms.length ? "questionable" : "good_law";
  const thin = citations.length === 0 && impacts.length === 0;
  const confidence: Confidence = thin ? "low" : finalVerdict === "questionable" ? "medium" : "high";
  const reasons = thin ? ["no later treatment found"] : [
    ...(binding.length ? [`${binding.length} binding overruling citation(s) from later same-jurisdiction cases at equal or higher court level.`] : []),
    ...(superseding.length ? [`${superseding.length} later repeal or superseding impact(s).`] : []),
    ...(nonBinding.length ? [`${nonBinding.length} non-binding overruling citation(s) do not establish binding overruling.`] : []),
    ...(criticisms.length ? [`${criticisms.length} criticism citation(s) warrant review.`] : []),
    ...(finalVerdict === "good_law" ? ["No binding overruling, later superseding impact, or negative treatment found."] : []),
  ];
  const adverse = (value: string) => value === "overruled" || value === "superseded";
  const statusMismatch = document.status !== finalVerdict && (adverse(document.status) || adverse(finalVerdict));
  const strongest = (a: Citation, b: Citation) => (b.court_level ?? 0) - (a.court_level ?? 0) || b.decision_date.localeCompare(a.decision_date) || a.doc_id.localeCompare(b.doc_id);
  const keyAuthorities = {
    bindingOverrulings: [...binding].sort(strongest),
    supersedingImpacts: [...superseding].sort((a, b) => b.published_at.localeCompare(a.published_at)),
    criticisms: [...criticisms].sort(strongest),
    nonBindingOverrulings: [...nonBinding].sort(strongest),
  };
  const treatmentCounts = {
    follows: citations.filter((row) => row.treatment === "follows").length,
    distinguishes: citations.filter((row) => row.treatment === "distinguishes").length,
    criticizes: criticisms.length, overrules: binding.length + nonBinding.length,
    bindingOverrulings: binding.length, nonBindingOverrulings: nonBinding.length, supersedingImpacts: superseding.length,
  };
  const selected = [
    ...keyAuthorities.bindingOverrulings,
    ...[...criticisms, ...nonBinding].sort(strongest),
    ...citations.filter((row) => row.treatment === "follows").sort(strongest).slice(0, 2),
  ].slice(0, 8).map((row) => ({ ...row, context_snippet: row.context_snippet.slice(0, 300) }));
  return {
    notice: SYNTHETIC_NOTICE, document, finalVerdict, confidence, reasons, statusMismatch,
    statusNote: statusMismatch ? `Stored status "${document.status}" disagrees with the rule verdict "${finalVerdict}"; review the record.` : "No adverse stored-status mismatch detected.",
    treatmentCounts, keyAuthorities, citingCount: citations.length,
    evidence: { document, verdict: finalVerdict, citations: selected, impacts: keyAuthorities.supersedingImpacts },
  };
}

function validateExplanation(text: string, allowedIds: Set<string>): Explanation {
  let value: unknown;
  try { value = JSON.parse(stripCodeFences(text)); } catch { throw new InvalidLegalAnswer("Invalid JSON"); }
  if (typeof value !== "object" || value === null) throw new InvalidLegalAnswer("Expected object");
  const v = value as Record<string, unknown>;
  const strings = (items: unknown): items is string[] => Array.isArray(items) && items.every((item) => typeof item === "string");
  if (typeof v.verdict !== "string" || !["good_law", "questionable", "overruled", "superseded", "insufficient_evidence"].includes(v.verdict)
    || typeof v.confidence !== "string" || !["high", "medium", "low"].includes(v.confidence)
    || typeof v.reasoning !== "string" || !v.reasoning.trim() || v.reasoning.trim().split(/\s+/).length > 80
    || !strings(v.supportingDocIds) || !strings(v.caveats)) throw new InvalidLegalAnswer("Invalid explanation shape");
  const caveats = [...v.caveats];
  if (v.supportingDocIds.some((id) => !allowedIds.has(id))) caveats.push("Unsupported document IDs from the AI response were removed.");
  return {
    verdict: v.verdict as Explanation["verdict"], confidence: v.confidence as Confidence,
    reasoning: v.reasoning, supportingDocIds: v.supportingDocIds.filter((id) => allowedIds.has(id)), caveats,
  };
}

const explanationCache = new WeakMap<Database.Database, Map<string, { fingerprint: string; explanation: Explanation }>>();

export async function goodLawReport(docId: string, explain: boolean, database = db) {
  const result = checkGoodLaw(docId, database);
  if (!result) return undefined;
  const { evidence, ...rules } = result;
  if (!explain) return { ...rules, explanation: null, source: "rules", disagreement: false, needsHumanReview: rules.statusMismatch || rules.finalVerdict === "questionable" || rules.confidence === "low" };
  const fingerprint = JSON.stringify(evidence);
  const cache = explanationCache.get(database) ?? new Map();
  explanationCache.set(database, cache);
  const cached = cache.get(docId);
  const allowedIds = new Set([evidence.document.doc_id, ...evidence.citations.map((row) => row.doc_id)]);
  const answer = cached?.fingerprint === fingerprint ? cached.explanation : await askLegal(GOOD_LAW_PROMPT, evidence, (text) => validateExplanation(text, allowedIds), 1);
  if (answer) cache.set(docId, { fingerprint, explanation: answer });
  const explanation: Explanation = answer ?? {
    verdict: rules.finalVerdict, confidence: rules.confidence, reasoning: rules.reasons.join(" "),
    supportingDocIds: [...new Set(evidence.citations.map((row) => row.doc_id))],
    caveats: ["Deterministic explanation: Claude was unavailable or invalid.", "Research support, not legal advice."],
  };
  const disagreement = explanation.verdict !== rules.finalVerdict;
  return {
    ...rules, explanation, source: answer ? "claude" : "fallback", disagreement,
    needsHumanReview: disagreement || rules.statusMismatch || rules.finalVerdict === "questionable" || rules.confidence === "low",
  };
}

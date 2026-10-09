import type Database from "better-sqlite3";
import { db } from "@/lib/db";
import { LEGAL_DOCUMENTS as D } from "@/lib/legal/config";
import { checkGoodLaw } from "@/lib/legal/goodLaw";
import { LEGAL_RELEVANCE } from "@/lib/analyze/config";
import type { LegalAuthority, LegalReport, UnverifiedCitation } from "@/lib/analyze/types";

interface DocRow {
  doc_id: string;
  title: string;
  doc_type: string;
  jurisdiction: string;
}

const docCache = new WeakMap<Database.Database, { docs: DocRow[]; jurisdictions: string[] }>();
const LEGAL_TERMS = /\b(?:courts?|plaintiffs?|defendants?|appellants?|statutes?|statutory|regulations?|jurisdictions?|tort|liability|precedents?|overrul\w*|legislation|judg(?:e)?ments?|rulings?|doctrine|appeals?)\b/gi;
const LEADING_NOISE = new Set(["see", "in", "the", "this", "that", "cf", "compare", "and", "but", "under", "as", "also", "following", "citing", "of", "per", "by"]);
const ABBREVIATIONS = new Set(["inc", "ltd", "co", "corp", "llc"]);
const TOKEN = "[A-Z][\\p{L}'’&-]*\\.?";

function loadDocs(database: Database.Database): { docs: DocRow[]; jurisdictions: string[] } | null {
  const exists = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(D.table);
  if (!exists) return null;
  const cached = docCache.get(database);
  if (cached) return cached;
  const docs = database.prepare(`SELECT ${D.doc_id}, ${D.title}, ${D.doc_type}, ${D.jurisdiction} FROM ${D.table}`).all() as DocRow[];
  const loaded = { docs, jurisdictions: [...new Set(docs.map((doc) => doc.jurisdiction))] };
  docCache.set(database, loaded);
  return loaded;
}

function snippetAt(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 90);
  return text.slice(start, index + length + 110).trim();
}

function stripTail(token: string): string {
  return token.endsWith(".") && !ABBREVIATIONS.has(token.slice(0, -1).toLowerCase()) ? token.slice(0, -1) : token;
}

function partyFromLeft(raw: string): string[] {
  const tokens = raw.trim().split(/\s+/);
  const lastBoundary = tokens.map((t) => t.endsWith(".") && !ABBREVIATIONS.has(t.slice(0, -1).toLowerCase())).lastIndexOf(true);
  let kept = tokens.slice(lastBoundary + 1);
  while (kept.length && LEADING_NOISE.has(kept[0].toLowerCase())) kept = kept.slice(1);
  return kept;
}

function partyFromRight(raw: string): string[] {
  const kept: string[] = [];
  for (const token of raw.trim().split(/\s+/)) {
    kept.push(stripTail(token));
    if (token.endsWith(".") && !ABBREVIATIONS.has(token.slice(0, -1).toLowerCase())) break;
  }
  return kept;
}

function findUnverified(text: string): UnverifiedCitation[] {
  const found = new Map<string, UnverifiedCitation>();
  const caseRule = new RegExp(`\\b((?:${TOKEN}\\s+){0,3}${TOKEN})\\s+v\\.?\\s+((?:${TOKEN}\\s+){0,3}${TOKEN})`, "gu");
  for (const match of text.matchAll(caseRule)) {
    const left = partyFromLeft(match[1]).map(stripTail);
    const right = partyFromRight(match[2]);
    if (!left.length || !right.length) continue;
    const label = `${left.join(" ")} v. ${right.join(" ")}`;
    if (label.length < 7) continue;
    const key = label.toLowerCase();
    if (!found.has(key)) found.set(key, { text: label, kind: "case", snippet: snippetAt(text, match.index ?? 0, match[0].length) });
  }
  const statuteRule = new RegExp(`\\b((?:${TOKEN.replace("\\.?", "")}\\s+){1,5}(?:Act|Regulations?|Directive|Code|Ordinance))(?:\\s+(?:of\\s+)?(\\d{4}))?\\b`, "gu");
  for (const match of text.matchAll(statuteRule)) {
    let tokens = match[1].split(/\s+/);
    while (tokens.length > 1 && LEADING_NOISE.has(tokens[0].toLowerCase())) tokens = tokens.slice(1);
    if (tokens.length < 2) continue;
    const label = `${tokens.join(" ")}${match[2] ? ` ${match[2]}` : ""}`;
    const key = label.toLowerCase();
    if (!found.has(key)) found.set(key, { text: label, kind: "statute", snippet: snippetAt(text, match.index ?? 0, match[0].length) });
  }
  return [...found.values()].slice(0, 15);
}

/**
 * Finds legal authorities that the paper cites and are known to the legal database, then applies the same
 * deterministic good-law rules as /api/legal/good-law. Authorities not found are listed as unverified,
 * which means "could not be checked", not "fabricated".
 */
export function scanLegal(text: string, database: Database.Database = db): LegalReport {
  const flat = text.replace(/\s+/g, " ");
  const lower = flat.toLowerCase();
  const legalTermCount = (flat.match(LEGAL_TERMS) ?? []).length;
  const loaded = loadDocs(database);

  const spans: [number, number][] = [];
  const hits = new Map<string, { mentions: number; first: number; length: number }>();
  for (const doc of loaded?.docs ?? []) {
    const needles = [doc.title.toLowerCase(), doc.doc_id.toLowerCase()].filter((needle) => needle.length >= 6);
    for (const needle of needles) {
      let from = lower.indexOf(needle);
      while (from !== -1) {
        const hit = hits.get(doc.doc_id);
        if (hit) hit.mentions++;
        else hits.set(doc.doc_id, { mentions: 1, first: from, length: needle.length });
        spans.push([from, from + needle.length]);
        from = lower.indexOf(needle, from + needle.length);
      }
    }
  }

  const authorities: LegalAuthority[] = [];
  for (const [docId, hit] of hits) {
    const result = checkGoodLaw(docId, database);
    if (!result) continue;
    authorities.push({
      docId,
      title: result.document.title,
      docType: result.document.doc_type,
      jurisdiction: result.document.jurisdiction,
      court: result.document.court,
      storedStatus: result.document.status,
      verdict: result.finalVerdict,
      confidence: result.confidence,
      statusMismatch: result.statusMismatch,
      mentions: hit.mentions,
      snippet: snippetAt(flat, hit.first, hit.length),
      reasons: result.reasons,
      citingCount: result.citingCount,
    });
  }
  const severity = { overruled: 0, superseded: 1, questionable: 2, good_law: 3 } as const;
  authorities.sort((a, b) => severity[a.verdict] - severity[b.verdict] || a.title.localeCompare(b.title));

  // Blank out recognised authorities so they are not reported again as unverified.
  const remaining = flat.split("");
  for (const [start, end] of spans) for (let i = start; i < end && i < remaining.length; i++) remaining[i] = " ";
  const candidates = findUnverified(remaining.join(""));
  // Citing authorities counts as legal content even when few legal keywords appear.
  const signals = legalTermCount + 3 * authorities.length + candidates.length;
  const relevance = signals >= LEGAL_RELEVANCE.high ? "high" : signals >= LEGAL_RELEVANCE.low ? "low" : "none";
  const unverified = relevance === "none" ? [] : candidates;

  const jurisdictions = (loaded?.jurisdictions ?? [])
    .map((name) => ({ name, mentions: (flat.match(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g")) ?? []).length }))
    .filter((entry) => entry.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));

  const count = (verdict: LegalAuthority["verdict"]) => authorities.filter((authority) => authority.verdict === verdict).length;
  return {
    available: loaded !== null,
    relevance,
    legalTermCount,
    authorities,
    unverified,
    jurisdictions,
    counts: {
      verified: authorities.length,
      goodLaw: count("good_law"),
      questionable: count("questionable"),
      overruled: count("overruled"),
      superseded: count("superseded"),
      unverified: unverified.length,
    },
    currencyRate: authorities.length ? count("good_law") / authorities.length : null,
  };
}

import { REFERENCE_CONFIG } from "@/lib/analyze/config";
import type { ReferenceStats, SectionCheck, StatementCheck, StructureReport } from "@/lib/analyze/types";
import { words } from "@/lib/text/similarity";

type SectionKey = "abstract" | "introduction" | "methods" | "results" | "discussion" | "conclusion" | "limitations" | "references";

const SECTIONS: { key: SectionKey; label: string; pattern: RegExp }[] = [
  { key: "abstract", label: "Abstract", pattern: /^abstract/i },
  { key: "introduction", label: "Introduction", pattern: /^(introduction|background)/i },
  { key: "methods", label: "Methods", pattern: /^(methods?|methodology|materials and methods|research design|data and methods)/i },
  { key: "results", label: "Results", pattern: /^(results?|findings)/i },
  { key: "discussion", label: "Discussion", pattern: /^(discussion|analysis and discussion)/i },
  { key: "conclusion", label: "Conclusion", pattern: /^(conclusions?|concluding remarks|summary and conclusions?)/i },
  { key: "limitations", label: "Limitations", pattern: /^limitations?/i },
  { key: "references", label: "References", pattern: /^(references|bibliography|works cited|literature cited)/i },
];

const CORE_SECTIONS: SectionKey[] = ["abstract", "introduction", "methods", "results", "discussion", "conclusion", "references"];

const HUMAN_SUBJECT_CUE = /\b(participants?|patients?|respondents?|interviewees?|volunteers?|cohort|survey(?:ed)?|questionnaires?)\b/i;

const STATEMENTS: { key: string; label: string; pattern: RegExp }[] = [
  {
    key: "conflict",
    label: "Conflict-of-interest statement",
    pattern: /conflicts?\s+of\s+interests?|competing\s+interests?|declare[sd]?\s+(?:that\s+)?(?:they\s+have\s+)?no\s+(?:competing|conflict)|disclosure\s+statement/i,
  },
  {
    key: "dataAvailability",
    label: "Data-availability statement",
    pattern: /data\s+availability|data\s+(?:are|is|will\s+be)\s+(?:openly\s+|publicly\s+)?available|available\s+(?:upon|on)\s+(?:reasonable\s+)?request|supplementary\s+(?:data|materials?)|deposited\s+(?:in|at)/i,
  },
  {
    key: "funding",
    label: "Funding statement",
    pattern: /\bfunding\b|funded\s+by|grant\s+(?:no|number|agreement)|financial\s+support|supported\s+by\s+(?:the\s+)?[A-Z]|no\s+external\s+funding/i,
  },
  {
    key: "ethics",
    label: "Ethics approval / consent",
    pattern: /ethic(?:s|al)\s+(?:approval|committee|review|clearance|board)|institutional\s+review\s+board|\bIRB\b|informed\s+consent|declaration\s+of\s+helsinki/i,
  },
  { key: "contributions", label: "Author contributions", pattern: /author\s+contributions?|credit\s+(?:author|taxonomy)|contributed\s+equally/i },
];

function headingKey(line: string): SectionKey | null {
  const stripped = line.replace(/^(?:\d+(?:\.\d+)*\.?|[IVXivx]{1,5}\.)\s*/, "");
  for (const { key, pattern } of SECTIONS) {
    const match = stripped.match(pattern);
    if (!match) continue;
    if (key === "abstract") return key;
    if (stripped.length > 60) return null;
    const rest = stripped.slice(match[0].length).trim();
    if (rest === "" || /^[:.\-–—]/.test(rest) || /^and\s+(discussion|conclusions?|limitations)$/i.test(rest)) return key;
  }
  return null;
}

function extractAbstract(lines: string[]): string | null {
  const start = lines.findIndex((line) => headingKey(line) === "abstract");
  if (start === -1) return null;
  const parts: string[] = [];
  const inline = lines[start].replace(/^(?:\d+\.?\s*)?abstract\s*[:.\-–—]?\s*/i, "");
  if (inline) parts.push(inline);
  for (let i = start + 1; i < lines.length; i++) {
    if (headingKey(lines[i]) !== null || /^keywords?\b/i.test(lines[i])) break;
    parts.push(lines[i]);
    if (words(parts.join(" ")).length > 300) break;
  }
  const text = parts.join(" ").trim();
  return text.length > 0 ? text : null;
}

function parseMarkerNumbers(group: string): number[] {
  const numbers: number[] = [];
  for (const piece of group.split(",")) {
    const range = piece.split(/[–-]/).map((part) => Number(part.trim()));
    if (range.length === 2 && range[0] <= range[1] && range[1] - range[0] < 100) {
      for (let n = range[0]; n <= range[1]; n++) numbers.push(n);
    } else if (range.length === 1 && Number.isFinite(range[0])) numbers.push(range[0]);
  }
  return numbers;
}

function analyzeReferences(lines: string[], body: string, currentYear: number): ReferenceStats {
  const start = lines.map((line) => headingKey(line)).lastIndexOf("references");
  const block = start === -1 ? [] : lines.slice(start + 1);

  const numbered = block.filter((line) => /^\s*(?:\[\d{1,3}\]|\d{1,3}[.)])\s+\S/.test(line)).length;
  const authorStart = block.filter((line) => /^[A-Z][\p{L}'’-]+,\s+(?:[A-Z]\.|[A-Z][a-z]+)/u.test(line)).length;
  const yearLines = block.filter((line) => /\b(?:19|20)\d\d\b/.test(line)).length;
  const count = Math.max(numbered, authorStart) || yearLines;

  const years = (block.join(" ").match(/\b(19[5-9]\d|20[0-4]\d)\b/g) ?? []).map(Number);
  const cutoff = currentYear - REFERENCE_CONFIG.oldYears;
  const olderShare = years.length >= REFERENCE_CONFIG.minYearsForShare ? years.filter((year) => year < cutoff).length / years.length : null;

  const seen = new Map<string, number>();
  for (const line of block) {
    const key = line.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (key.length >= 30) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const duplicates = [...seen.values()].reduce((sum, n) => sum + (n > 1 ? n - 1 : 0), 0);

  const numericNumbers: number[] = [];
  let numericMarkers = 0;
  for (const match of body.matchAll(/\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]/g)) {
    numericMarkers++;
    numericNumbers.push(...parseMarkerNumbers(match[1]));
  }
  const authorYearMarkers = [...body.matchAll(/\(\s*[A-Z][\p{L}'’-]+(?:\s+et al\.?|\s+(?:and|&)\s+[A-Z][\p{L}'’-]+)?,?\s+(?:19|20)\d\d[a-z]?\s*\)/gu)].length;

  return {
    found: start !== -1,
    count,
    citationMarkers: numericMarkers + authorYearMarkers,
    maxNumericMarker: numericNumbers.length ? Math.max(...numericNumbers) : null,
    olderShare,
    duplicates,
    yearRange: years.length ? [Math.min(...years), Math.max(...years)] : null,
  };
}

export function analyzeStructure(text: string, currentYear = new Date().getFullYear()): StructureReport & { abstractText: string | null } {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const found = new Set(lines.map(headingKey).filter((key): key is SectionKey => key !== null));
  const sections: SectionCheck[] = SECTIONS.filter((section) => CORE_SECTIONS.includes(section.key) || found.has(section.key)).map(({ key, label }) => ({
    key,
    label,
    found: found.has(key),
  }));

  const humanSubjects = HUMAN_SUBJECT_CUE.test(text);
  const statements: StatementCheck[] = STATEMENTS.map(({ key, label, pattern }) => ({
    key,
    label,
    found: pattern.test(text),
    applicable: key === "ethics" ? humanSubjects : true,
  }));

  const referenceStart = lines.map(headingKey).lastIndexOf("references");
  const body = referenceStart === -1 ? text : lines.slice(0, referenceStart).join("\n");
  const abstractText = extractAbstract(lines);
  const distinct = (pattern: RegExp) => new Set([...text.matchAll(pattern)].map((match) => match[1])).size;

  return {
    words: words(text).length,
    abstractWords: abstractText ? words(abstractText).length : null,
    abstractText,
    sections,
    statements,
    references: analyzeReferences(lines, body, currentYear),
    figures: distinct(/\bfig(?:ure|\.)?\s*(\d{1,2})\b/gi),
    tables: distinct(/\btable\s*(\d{1,2})\b/gi),
  };
}

export function completenessScore(structure: StructureReport): number {
  const sections = structure.sections.filter((section) => CORE_SECTIONS.includes(section.key as SectionKey));
  const statements = structure.statements.filter((statement) => statement.applicable);
  const total = sections.length + statements.length;
  if (total === 0) return 0;
  return Math.round((100 * (sections.filter((s) => s.found).length + statements.filter((s) => s.found).length)) / total);
}

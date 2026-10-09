import type Database from "better-sqlite3";
import { db } from "@/lib/db";
import { INTEGRITY_LEVEL_CUTOFFS, INTEGRITY_MAX_POINTS, REFERENCE_CONFIG, SIMILARITY_CONFIG, STATEMENT_POINTS } from "@/lib/analyze/config";
import type { Anomaly, IntegrityReport, IntegritySignal, RiskLevel, SimilarMatch, StructureReport } from "@/lib/analyze/types";
import { containment, rank, shingles, words } from "@/lib/text/similarity";
import { loadPublishedCorpus } from "@/lib/analyze/publishedCorpus";

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const pct = (value: number) => `${Math.round(value * 100)}%`;

function compareAgainstPublished(query: string, database: Database.Database) {
  const corpus = loadPublishedCorpus(database);
  const queryShingles = shingles(words(query), SIMILARITY_CONFIG.shingleSize);
  const matches: SimilarMatch[] = rank(corpus.index, query, SIMILARITY_CONFIG.topMatches * 3).map(({ id, score }) => {
    const paper = corpus.papers.get(id)!;
    return {
      paperId: id,
      title: paper.title,
      doi: paper.doi,
      cosine: Math.round(score * 1000) / 1000,
      containment: Math.round(containment(queryShingles, shingles(words(paper.abstract), SIMILARITY_CONFIG.shingleSize)) * 1000) / 1000,
    };
  });
  matches.sort((a, b) => Math.max(b.cosine, b.containment) - Math.max(a.cosine, a.containment));
  return { matches: matches.slice(0, SIMILARITY_CONFIG.topMatches), corpusSize: corpus.index.size };
}

function similaritySignal(matches: SimilarMatch[], corpusSize: number, comparable: boolean): IntegritySignal {
  const max = INTEGRITY_MAX_POINTS.similarity;
  const base = { key: "similarity", label: "Similarity to published papers", maxPoints: max };
  if (!comparable || corpusSize === 0) {
    return { ...base, points: 0, applicable: false, evidence: corpusSize === 0 ? "No published abstracts are available to compare against." : "Not enough abstract or opening text to compare." };
  }
  const top = matches[0];
  const strength = top ? Math.max(top.cosine, top.containment) : 0;
  const points = Math.round(max * clamp((strength - 0.25) / (SIMILARITY_CONFIG.highCosine - 0.25)));
  const evidence = top
    ? `Closest of ${corpusSize} published abstracts (${top.paperId}): cosine ${top.cosine.toFixed(2)}, ${pct(top.containment)} of ${SIMILARITY_CONFIG.shingleSize}-word phrases shared; flag threshold ${SIMILARITY_CONFIG.flagCosine}.`
    : `No overlap found among ${corpusSize} published abstracts; flag threshold ${SIMILARITY_CONFIG.flagCosine}.`;
  return { ...base, points, applicable: true, evidence };
}

function statementsSignal(structure: StructureReport): IntegritySignal {
  const missing = structure.statements.filter((s) => s.applicable && !s.found && s.key in STATEMENT_POINTS);
  const points = missing.reduce((sum, s) => sum + STATEMENT_POINTS[s.key as keyof typeof STATEMENT_POINTS], 0);
  const expected = structure.statements.filter((s) => s.applicable && s.key in STATEMENT_POINTS).length;
  return {
    key: "statements",
    label: "Integrity statements",
    points,
    maxPoints: INTEGRITY_MAX_POINTS.statements,
    applicable: true,
    evidence: missing.length ? `${missing.length} of ${expected} expected statements not found: ${missing.map((s) => s.label).join(", ")}.` : `All ${expected} expected statements found.`,
  };
}

function referencesSignal(structure: StructureReport): IntegritySignal {
  const refs = structure.references;
  const max = INTEGRITY_MAX_POINTS.references;
  const notes: string[] = [];
  let points = 0;
  if (!refs.found) {
    points += 14;
    notes.push("no reference list found");
  } else if (refs.count < REFERENCE_CONFIG.veryFew) {
    points += 10;
    notes.push(`only ${refs.count} references (very-few threshold ${REFERENCE_CONFIG.veryFew})`);
  } else if (refs.count < REFERENCE_CONFIG.minExpected) {
    points += 6;
    notes.push(`${refs.count} references (expected at least ${REFERENCE_CONFIG.minExpected})`);
  }
  if (refs.found && refs.maxNumericMarker !== null && refs.maxNumericMarker > refs.count) {
    points += 6;
    notes.push(`in-text citation [${refs.maxNumericMarker}] exceeds the ${refs.count} listed references`);
  }
  if (refs.olderShare !== null && refs.olderShare > REFERENCE_CONFIG.oldShareFlag) {
    points += 4;
    notes.push(`${pct(refs.olderShare)} of dated references are older than ${REFERENCE_CONFIG.oldYears} years (threshold ${pct(REFERENCE_CONFIG.oldShareFlag)})`);
  }
  if (refs.duplicates > 0) {
    points += 3;
    notes.push(`${refs.duplicates} duplicated reference line(s)`);
  }
  return {
    key: "references",
    label: "Reference quality",
    points: Math.min(max, points),
    maxPoints: max,
    applicable: true,
    evidence: notes.length ? `${notes.join("; ")}.` : `${refs.count} references; no issues against thresholds.`,
  };
}

function anomaliesSignals(anomalies: Anomaly[]): IntegritySignal[] {
  const count = (kind: Anomaly["kind"]) => anomalies.find((a) => a.kind === kind)?.count ?? 0;
  const tortured = count("tortured_phrase");
  const placeholders = count("placeholder");
  const duplicates = count("duplicate_text");
  const textPoints = (tortured >= 5 ? 15 : tortured >= 3 ? 10 : tortured >= 1 ? 5 : 0) + (placeholders > 0 ? 5 : 0) + (duplicates >= 3 ? 5 : 0);
  const injection = count("reviewer_manipulation");
  const artefacts = count("llm_artifact");
  const manipulationPoints = injection > 0 ? INTEGRITY_MAX_POINTS.manipulation : artefacts > 0 ? 8 : 0;
  return [
    {
      key: "textAnomalies",
      label: "Suspicious wording",
      points: Math.min(INTEGRITY_MAX_POINTS.textAnomalies, textPoints),
      maxPoints: INTEGRITY_MAX_POINTS.textAnomalies,
      applicable: true,
      evidence: `${tortured} tortured phrase(s), ${placeholders} placeholder(s), ${duplicates} verbatim-repeated sentence(s) (thresholds: 1 / 1 / 3).`,
    },
    {
      key: "manipulation",
      label: "AI traces & reviewer manipulation",
      points: manipulationPoints,
      maxPoints: INTEGRITY_MAX_POINTS.manipulation,
      applicable: true,
      evidence: `${injection} instruction(s) aimed at reviewers/AI tools, ${artefacts} chatbot leftover(s) (any occurrence is flagged).`,
    },
  ];
}

export function levelFor(score: number): RiskLevel {
  return score >= INTEGRITY_LEVEL_CUTOFFS.high ? "high" : score >= INTEGRITY_LEVEL_CUTOFFS.medium ? "medium" : "low";
}

export function assessIntegrity(
  input: { structure: StructureReport; abstractText: string | null; text: string; anomalies: Anomaly[] },
  database: Database.Database = db,
): IntegrityReport {
  const abstractUsable = input.abstractText !== null && words(input.abstractText).length >= SIMILARITY_CONFIG.minQueryWords;
  const query = abstractUsable ? input.abstractText! : words(input.text).slice(0, 250).join(" ");
  const comparable = words(query).length >= SIMILARITY_CONFIG.minQueryWords;
  const { matches, corpusSize } = comparable ? compareAgainstPublished(query, database) : { matches: [], corpusSize: loadPublishedCorpus(database).index.size };
  const signals = [similaritySignal(matches, corpusSize, comparable), statementsSignal(input.structure), referencesSignal(input.structure), ...anomaliesSignals(input.anomalies)];
  const score = signals.reduce((sum, signal) => sum + signal.points, 0);
  return {
    score,
    level: levelFor(score),
    signals,
    matches,
    anomalies: input.anomalies,
    corpusSize,
    comparedAgainst: comparable ? (abstractUsable ? "abstract" : "opening_text") : null,
  };
}

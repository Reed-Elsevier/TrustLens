import { db } from "@/lib/db";
import { DOC_TYPES, EDITORIAL_TASKS as T, MIN_GROUP_N, SIGNIFICANCE_Z, SYNTHETIC_NOTICE } from "@/lib/legal/config";
import { mean, median, twoProportionZ } from "@/lib/legal/stats";
import { askLegal, validateSummary } from "@/lib/legal/http";
import { PILOT_PROMPT } from "@/lib/legal/prompts";

interface TaskMetric {
  doc_type: string;
  classified_by: "auto" | "manual";
  completed_at: string | null;
  hours: number | null;
  classification_correct: string | null;
  rework_needed: string | null;
}

function group(rows: TaskMetric[]) {
  const completed = rows.filter((row) => row.completed_at !== null);
  const hours = completed.map((row) => row.hours).filter((value): value is number => value !== null);
  const accuracyRows = rows.filter((row) => row.classification_correct !== null);
  const reworkRows = rows.filter((row) => row.rework_needed !== null);
  const correct = accuracyRows.filter((row) => row.classification_correct === "TRUE").length;
  const rework = reworkRows.filter((row) => row.rework_needed === "TRUE").length;
  return {
    n: rows.length, nCompleted: completed.length,
    speed: { median: median(hours), mean: mean(hours) },
    accuracy: accuracyRows.length ? correct / accuracyRows.length : null,
    reworkRate: reworkRows.length ? rework / reworkRows.length : null,
    accuracyN: accuracyRows.length, accuracyCorrect: correct,
    reworkN: reworkRows.length, reworkCount: rework,
  };
}

function compare(rows: TaskMetric[]) {
  const manual = group(rows.filter((row) => row.classified_by === "manual"));
  const auto = group(rows.filter((row) => row.classified_by === "auto"));
  const speedChangePct = manual.speed.median === null || manual.speed.median <= 0 || auto.speed.median === null
    ? null : (auto.speed.median - manual.speed.median) / manual.speed.median * 100;
  const accuracyDeltaPts = auto.accuracy === null || manual.accuracy === null ? null : (auto.accuracy - manual.accuracy) * 100;
  const reworkDeltaPts = auto.reworkRate === null || manual.reworkRate === null ? null : (auto.reworkRate - manual.reworkRate) * 100;
  const accuracyTest = twoProportionZ(auto.accuracyCorrect, auto.accuracyN, manual.accuracyCorrect, manual.accuracyN);
  const reworkTest = twoProportionZ(auto.reworkCount, auto.reworkN, manual.reworkCount, manual.reworkN);
  const worse = (accuracyTest.significant && (accuracyDeltaPts ?? 0) < 0) || (reworkTest.significant && (reworkDeltaPts ?? 0) > 0);
  const better = (accuracyTest.significant && (accuracyDeltaPts ?? 0) > 0) || (reworkTest.significant && (reworkDeltaPts ?? 0) < 0);
  // Quality trade-off verdicts require >=10% faster; any speed gain without
  // significant quality differences qualifies as faster_only.
  const verdict = speedChangePct === null ? "no_clear_change"
    : speedChangePct <= -10 ? worse ? "faster_but_worse" : better ? "faster_and_better" : "faster_only"
      : speedChangePct < 0 && !worse && !better ? "faster_only"
        : speedChangePct > 0 ? "slower" : "no_clear_change";
  return { manual, auto, comparison: { speedChangePct, accuracyDeltaPts, reworkDeltaPts, accuracyTest, reworkTest }, verdict };
}

export function getPilot(database = db) {
  const rows = database.prepare(`
    SELECT ${T.doc_type}, ${T.classified_by}, ${T.completed_at}, ${T.classification_correct}, ${T.rework_needed},
      (julianday(${T.completed_at}) - julianday(${T.assigned_at})) * 24 AS hours
    FROM ${T.table}
  `).all() as TaskMetric[];
  const overall = compare(rows);
  const byDocType = DOC_TYPES.map((docType) => {
    const result = compare(rows.filter((row) => row.doc_type === docType));
    return {
      docType, ...result,
      manualShare: overall.manual.n ? result.manual.n / overall.manual.n : null,
      autoShare: overall.auto.n ? result.auto.n / overall.auto.n : null,
    };
  });
  const mixWarning = byDocType.some((row) => row.autoShare !== null && row.manualShare !== null && Math.abs(row.autoShare - row.manualShare) > 0.15);
  const eligible = byDocType.filter((row) => [row.manual, row.auto].every((g) =>
    g.nCompleted >= MIN_GROUP_N && g.accuracyN >= MIN_GROUP_N && g.reworkN >= MIN_GROUP_N));
  const consistentAcrossTypes = eligible.length > 0 && eligible.every((row) => row.verdict === overall.verdict);
  const verdictNote = `${mixWarning ? "Auto and manual doc-type mixes differ by more than 15 percentage points; compare within types. " : ""}${eligible.length === 0 ? "No doc type has enough data for a reliable within-type comparison." : consistentAcrossTypes ? "All sufficiently sampled doc types agree with the overall verdict." : "Overall and sufficiently sampled doc-type verdicts differ; inspect within-type quality significance."} This is an observational comparison, not evidence of causation.`;
  return {
    notice: SYNTHETIC_NOTICE, meta: { significanceZ: SIGNIFICANCE_Z, minGroupN: MIN_GROUP_N },
    overall, byDocType, verdict: overall.verdict, verdictNote, mixWarning, consistentAcrossTypes,
  };
}

export async function pilotReport(summary: boolean, database = db) {
  const result = getPilot(database);
  if (!summary) return { ...result, summary: null, summarySource: null };
  const answer = await askLegal(PILOT_PROMPT, {
    overall: result.overall, byDocType: result.byDocType, mixWarning: result.mixWarning,
    consistentAcrossTypes: result.consistentAcrossTypes,
  }, (text) => validateSummary(text, 90));
  const labels: Record<string, string> = {
    faster_but_worse: "The pilot is faster but has significantly worse quality outcomes.",
    faster_and_better: "The pilot is faster with at least one significantly better quality outcome.",
    faster_only: "The pilot improves speed, with no significant quality difference detected.",
    slower: "The pilot is slower.", no_clear_change: "The pilot shows no clear improvement.",
  };
  return { ...result, summary: answer ?? `${labels[result.verdict]} ${result.verdictNote}`, summarySource: answer === undefined ? "fallback" : "claude" };
}

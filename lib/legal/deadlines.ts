import type Database from "better-sqlite3";
import { db } from "@/lib/db";
import { AS_OF, DEADLINE_HOURS, MIN_SAMPLE_DEFAULT, REGULATORY_UPDATES as U, SYNTHETIC_NOTICE } from "@/lib/legal/config";
import { median, percentile } from "@/lib/legal/stats";
import { askLegal, validateSummary } from "@/lib/legal/http";
import { DEADLINES_PROMPT } from "@/lib/legal/prompts";

interface UpdateMetric {
  jurisdiction: string;
  completed: number;
  overdue: number;
  pending: number;
  miss: number;
  hoursLate: number | null;
  dueMismatch: number;
}

function computeDeadlines(database: Database.Database) {
  // The clock starts at received_at; stored due_at remains authoritative even if it is inconsistent.
  // A miss is completed > due, or open with AS_OF > due. Pending open rows are not resolved.
  // Miss lateness uses (julianday(COALESCE(completed_at, AS_OF)) - julianday(due_at)) * 24.
  const rows = database.prepare(`
    SELECT ${U.jurisdiction} AS jurisdiction,
      (${U.completed_at} IS NOT NULL) AS completed,
      (${U.completed_at} IS NULL AND julianday(?) > julianday(${U.due_at})) AS overdue,
      (${U.completed_at} IS NULL AND julianday(?) <= julianday(${U.due_at})) AS pending,
      (julianday(COALESCE(${U.completed_at}, ?)) > julianday(${U.due_at})) AS miss,
      CASE WHEN julianday(COALESCE(${U.completed_at}, ?)) > julianday(${U.due_at})
        THEN (julianday(COALESCE(${U.completed_at}, ?)) - julianday(${U.due_at})) * 24 END AS hoursLate,
      (julianday(${U.due_at}) IS NULL OR julianday(${U.received_at}) IS NULL
        OR ABS((julianday(${U.due_at}) - julianday(${U.received_at})) * 24 - ?) > 0.000001) AS dueMismatch
    FROM ${U.table}
  `).all(AS_OF, AS_OF, AS_OF, AS_OF, AS_OF, DEADLINE_HOURS) as UpdateMetric[];
  const grouped = new Map<string, UpdateMetric[]>();
  for (const row of rows) {
    const group = grouped.get(row.jurisdiction) ?? [];
    group.push(row);
    grouped.set(row.jurisdiction, group);
  }
  const jurisdictions = [...grouped].map(([jurisdiction, items]) => {
    const misses = items.filter((row) => row.miss === 1);
    const resolved = items.filter((row) => row.completed === 1 || row.overdue === 1).length;
    const hours = misses.map((row) => row.hoursLate).filter((value): value is number => value !== null).sort((a, b) => a - b);
    return {
      jurisdiction, total: items.length, resolved, misses: misses.length,
      missRate: resolved === 0 ? null : misses.length / resolved,
      completedLate: misses.filter((row) => row.completed === 1).length,
      stillOpenOverdue: items.filter((row) => row.overdue === 1).length,
      pending: items.filter((row) => row.pending === 1).length,
      medianHoursLate: median(hours), p90HoursLate: percentile(hours, 90),
    };
  });
  const misses = jurisdictions.reduce((sum, row) => sum + row.misses, 0);
  const resolved = jurisdictions.reduce((sum, row) => sum + row.resolved, 0);
  return {
    jurisdictions,
    warnings: rows.some((row) => row.dueMismatch) ? [`${rows.filter((row) => row.dueMismatch).length} update(s) have due_at inconsistent with received_at + ${DEADLINE_HOURS} hours.`] : [],
    overall: { total: rows.length, misses, missRate: resolved === 0 ? null : misses / resolved },
  };
}

const numericCache = new WeakMap<Database.Database, ReturnType<typeof computeDeadlines>>();

export function getDeadlines(minSample = MIN_SAMPLE_DEFAULT, database = db) {
  let numeric = numericCache.get(database);
  if (!numeric) {
    numeric = computeDeadlines(database);
    numericCache.set(database, numeric);
  }
  const all = numeric.jurisdictions.map((row) => ({ ...row, lowSample: row.resolved < minSample }));
  const sort = (a: (typeof all)[number], b: (typeof all)[number]) =>
    (b.missRate ?? -1) - (a.missRate ?? -1) || b.misses - a.misses || a.jurisdiction.localeCompare(b.jurisdiction);
  return {
    notice: SYNTHETIC_NOTICE,
    meta: { asOf: AS_OF, deadlineHours: DEADLINE_HOURS, minSample, clock: "received_at", warnings: [...numeric.warnings] },
    ranked: all.filter((row) => !row.lowSample).sort(sort),
    lowSample: all.filter((row) => row.lowSample).sort(sort),
    overall: { ...numeric.overall },
  };
}

export async function deadlineReport(minSample: number, summary: boolean, database = db) {
  const result = getDeadlines(minSample, database);
  if (!summary) return { ...result, summary: null, summarySource: null };
  const evidence = { ranked: result.ranked, lowSample: result.lowSample, overall: result.overall };
  const answer = await askLegal(DEADLINES_PROMPT, evidence, (text) => validateSummary(text, 80));
  const worst = result.ranked.slice(0, 3).map((row) => `${row.jurisdiction} (${(100 * (row.missRate ?? 0)).toFixed(1)}%)`).join(", ");
  const overdue = [...result.ranked, ...result.lowSample].reduce((sum, row) => sum + row.stillOpenOverdue, 0);
  return {
    ...result,
    summary: answer ?? `Worst ranked jurisdictions: ${worst || "none"}. There are ${overdue} open overdue items. Low-sample jurisdictions are excluded from the ranking.`,
    summarySource: answer === undefined ? "fallback" : "claude",
  };
}

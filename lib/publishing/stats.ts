/**
 * Percentile and distribution helpers. SQLite has no percentile function, so
 * every distribution is pulled as a sorted array and summarised here in
 * TypeScript.
 */

export interface Distribution {
  count: number;
  min: number | null;
  p10: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
}

/** Linear-interpolation percentile over an already-sorted ascending array. */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  if (lowerIndex === upperIndex) return sorted[lowerIndex];
  const weight = rank - lowerIndex;
  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
}

export function summarize(values: number[]): Distribution {
  const sorted = [...values].filter((v) => v !== null && !Number.isNaN(v)).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { count: 0, min: null, p10: null, p25: null, median: null, p75: null, p90: null, p95: null, p99: null, max: null };
  }
  return {
    count: sorted.length,
    min: sorted[0],
    p10: percentile(sorted, 10),
    p25: percentile(sorted, 25),
    median: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
  };
}

export function mean(values: number[]): number | null {
  const valid = values.filter((v) => v !== null && !Number.isNaN(v));
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

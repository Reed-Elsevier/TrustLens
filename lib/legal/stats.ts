import { percentile } from "@/lib/publishing/stats";
import { MIN_GROUP_N, SIGNIFICANCE_Z } from "@/lib/legal/config";
export { percentile, mean } from "@/lib/publishing/stats";

export function median(values: number[]): number | null {
  return percentile(values.filter(Number.isFinite).sort((a, b) => a - b), 50);
}

// Pooled two-proportion test; eligibility uses each metric's non-null denominator.
export function twoProportionZ(autoSuccesses: number, autoN: number, manualSuccesses: number, manualN: number) {
  if (autoN === 0 || manualN === 0) return { z: null, significant: false };
  const pooled = (autoSuccesses + manualSuccesses) / (autoN + manualN);
  const variance = pooled * (1 - pooled) * (1 / autoN + 1 / manualN);
  const z = variance === 0 ? 0 : (autoSuccesses / autoN - manualSuccesses / manualN) / Math.sqrt(variance);
  return { z, significant: autoN >= MIN_GROUP_N && manualN >= MIN_GROUP_N && Math.abs(z) >= SIGNIFICANCE_Z };
}

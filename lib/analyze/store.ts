import { STORE_CONFIG } from "@/lib/analyze/config";
import type { AnalysisResult, Review } from "@/lib/analyze/types";

export interface StoredAnalysis {
  result: AnalysisResult;
  text: string;
  chunks: string[];
  abstractText: string | null;
  review?: { value: Review; source: "claude" | "fallback" };
  pendingReview?: Promise<{ value: Review; source: "claude" | "fallback" }>;
  touchedAt: number;
}

declare global {
  var __trustlensAnalyses: Map<string, StoredAnalysis> | undefined;
}

// Bounded in-memory store (LRU + TTL). Uploaded PDFs themselves are never kept, only the extracted analysis.
function store(): Map<string, StoredAnalysis> {
  globalThis.__trustlensAnalyses ??= new Map();
  return globalThis.__trustlensAnalyses;
}

function prune(entries: Map<string, StoredAnalysis>) {
  const now = Date.now();
  for (const [id, entry] of entries) if (now - entry.touchedAt > STORE_CONFIG.ttlMs) entries.delete(id);
  while (entries.size > STORE_CONFIG.maxEntries) entries.delete(entries.keys().next().value as string);
}

export function putAnalysis(entry: Omit<StoredAnalysis, "touchedAt">): StoredAnalysis {
  const entries = store();
  const stored = { ...entry, touchedAt: Date.now() };
  entries.delete(entry.result.id);
  entries.set(entry.result.id, stored);
  prune(entries);
  return stored;
}

export function getAnalysis(id: string): StoredAnalysis | undefined {
  const entries = store();
  prune(entries);
  const entry = entries.get(id);
  if (!entry) return undefined;
  entry.touchedAt = Date.now();
  entries.delete(id);
  entries.set(id, entry);
  return entry;
}

export function clearAnalyses() {
  store().clear();
}

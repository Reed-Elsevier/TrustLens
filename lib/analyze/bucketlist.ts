import type { AnalysisResult, Severity, TaskProposal } from "@/lib/analyze/types";

export const BUCKET_STORAGE_KEY = "trustlens.bucketlist.v1";
export const BUCKET_LIMITS = { documents: 10, tasks: 100 };

export interface AnalysisSnapshot {
  id: string;
  fileName: string;
  words: number;
  truncated: boolean;
  analyzedAt: string;
  findings: string[];
  measurements: Record<string, string>;
  checks: Record<string, boolean>;
}

export interface TaskVerification {
  status: "outstanding" | "resolved" | "needs_review";
  analysisId: string;
  before: string;
  after: string;
}

export interface BucketTask extends TaskProposal {
  id: string;
  originAnalysisId: string;
  completedBy: "manual" | "automatic" | null;
  verification?: TaskVerification;
}

export interface BucketDocument {
  id: string;
  analysisIds?: string[];
  latest: AnalysisSnapshot;
  previous?: AnalysisSnapshot;
  tasks: BucketTask[];
}

export function documentAnalysisIds(document: BucketDocument): string[] {
  return [...new Set([
    ...(document.analysisIds ?? []), document.latest.id,
    ...(document.previous ? [document.previous.id] : []), ...document.tasks.map((task) => task.originAnalysisId),
  ])];
}

export interface BucketData {
  version: 1;
  currentId: string | null;
  documents: BucketDocument[];
}

export const EMPTY_BUCKET_DATA: BucketData = { version: 1, currentId: null, documents: [] };

export function snapshotAnalysis(result: AnalysisResult, analyzedAt = new Date().toISOString()): AnalysisSnapshot {
  const checks: Record<string, boolean> = {};
  const measurements: Record<string, string> = {};
  for (const section of result.structure.sections) {
    const id = `structure.section.${section.key}`;
    checks[id] = section.found;
    measurements[id] = `${section.label} heading: ${section.found ? "detected" : "not detected"}`;
  }
  for (const statement of result.structure.statements) {
    const id = `structure.statement.${statement.key}`;
    // Inapplicability is not evidence that the requested statement was added.
    if (statement.applicable) checks[id] = statement.found;
    measurements[id] = `${statement.label}: ${!statement.applicable ? "not applicable" : statement.found ? "detected" : "not detected"}`;
  }
  const refs = result.structure.references;
  checks["references.missing"] = refs.found;
  measurements["references.missing"] = `Reference list: ${refs.found ? "detected" : "not detected"}`;
  if (refs.found) {
    checks["references.duplicates"] = refs.duplicates === 0;
    measurements["references.duplicates"] = `${refs.duplicates} duplicate reference line(s)`;
    if (refs.maxNumericMarker !== null) {
      checks["references.mismatch"] = refs.maxNumericMarker <= refs.count;
      measurements["references.mismatch"] = `Largest citation [${refs.maxNumericMarker}], ${refs.count} references`;
    }
  }
  measurements["references.few"] = `${refs.count} references detected`;
  for (const finding of result.findings) {
    measurements[finding.id] ??= `${finding.title}: still flagged`;
  }
  return {
    id: result.id, fileName: result.file.name, words: result.file.words, truncated: result.file.truncated,
    analyzedAt, findings: result.findings.map((finding) => finding.id), measurements, checks,
  };
}

export function sameTask(task: TaskProposal, proposal: TaskProposal): boolean {
  if (task.findingIds.length && proposal.findingIds.length) {
    return [...task.findingIds].sort().join("|") === [...proposal.findingIds].sort().join("|");
  }
  const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");
  return normalize(task.action) === normalize(proposal.action);
}

export function addBucketTask(document: BucketDocument, proposal: TaskProposal, id: string): BucketDocument {
  if (document.tasks.some((task) => sameTask(task, proposal))) return document;
  if (document.tasks.length >= BUCKET_LIMITS.tasks) throw new Error(`This bucket list has reached its ${BUCKET_LIMITS.tasks}-task limit. Delete a task before adding another.`);
  if (!proposal.title.trim() || !proposal.action.trim()) throw new Error("A task needs a title and an action.");
  return {
    ...document,
    tasks: [...document.tasks, { ...proposal, title: proposal.title.trim().slice(0, 200), action: proposal.action.trim().slice(0, 600), id, originAnalysisId: document.latest.id, completedBy: null }],
  };
}

function verifyTask(task: BucketTask, before: AnalysisSnapshot, after: AnalysisSnapshot): TaskVerification {
  const evidence = (snapshot: AnalysisSnapshot) => task.findingIds.map((id) => snapshot.measurements[id] ?? "Previously flagged check is no longer reported; human review required.").join("; ") || "Custom task: no deterministic check linked.";
  const base = { analysisId: after.id, before: evidence(before), after: evidence(after) };
  if (before.truncated || after.truncated || after.words < before.words / 2) {
    return { ...base, status: "needs_review", after: `${base.after} Comparison is incomplete: truncated text or substantially reduced document length.` };
  }
  if (task.findingIds.some((id) => after.findings.includes(id))) return { ...base, status: "outstanding" };
  if (task.findingIds.length > 0 && task.findingIds.every((id) => before.checks[id] === false && after.checks[id] === true)) {
    return { ...base, status: "resolved" };
  }
  // An already resolved deterministic check stays resolved on later revisions.
  if (task.completedBy === "automatic" && task.findingIds.every((id) => after.checks[id] === true)) return { ...base, status: "resolved" };
  return { ...base, status: "needs_review" };
}

export function compareRevision(document: BucketDocument, latest: AnalysisSnapshot): BucketDocument {
  if (document.latest.id === latest.id) return document;
  return {
    ...document, analysisIds: [...new Set([...documentAnalysisIds(document), latest.id])], previous: document.latest, latest,
    tasks: document.tasks.map((task) => {
      const verification = verifyTask(task, document.latest, latest);
      return {
        ...task, verification,
        completedBy: task.completedBy === "manual" ? "manual" : verification.status === "resolved" ? "automatic" : null,
      };
    }),
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function stringMap(value: unknown): value is Record<string, string> {
  return record(value) && Object.values(value).every((item) => typeof item === "string");
}
function snapshot(value: unknown): value is AnalysisSnapshot {
  return record(value) && typeof value.id === "string" && typeof value.fileName === "string" &&
    typeof value.words === "number" && Number.isFinite(value.words) && value.words >= 0 &&
    typeof value.truncated === "boolean" && typeof value.analyzedAt === "string" &&
    strings(value.findings) && stringMap(value.measurements) && record(value.checks) &&
    Object.values(value.checks).every((item) => typeof item === "boolean");
}
function severity(value: unknown): value is Severity {
  return value === "high" || value === "medium" || value === "low";
}
function task(value: unknown): value is BucketTask {
  if (!record(value) || typeof value.id !== "string" || typeof value.originAnalysisId !== "string" ||
    typeof value.title !== "string" || !value.title.trim() || typeof value.action !== "string" || !value.action.trim() ||
    !severity(value.severity) || !strings(value.findingIds) ||
    (value.completedBy !== null && value.completedBy !== "manual" && value.completedBy !== "automatic")) return false;
  const v = value.verification;
  return v === undefined || (record(v) && (v.status === "outstanding" || v.status === "resolved" || v.status === "needs_review") &&
    typeof v.analysisId === "string" && typeof v.before === "string" && typeof v.after === "string");
}
function document(value: unknown): value is BucketDocument {
  return record(value) && typeof value.id === "string" && snapshot(value.latest) &&
    (value.analysisIds === undefined || (strings(value.analysisIds) && value.analysisIds.every((id) => /^[a-f0-9]{16}$/.test(id)))) &&
    (value.previous === undefined || snapshot(value.previous)) &&
    Array.isArray(value.tasks) && value.tasks.length <= BUCKET_LIMITS.tasks && value.tasks.every(task) &&
    new Set(value.tasks.map((item) => item.id)).size === value.tasks.length;
}

export function parseBucketData(text: string): BucketData {
  const value: unknown = JSON.parse(text);
  if (!record(value) || value.version !== 1 || (value.currentId !== null && typeof value.currentId !== "string") ||
    !Array.isArray(value.documents) || value.documents.length > BUCKET_LIMITS.documents || !value.documents.every(document) ||
    new Set(value.documents.map((item) => item.id)).size !== value.documents.length ||
    (value.currentId !== null && !value.documents.some((item) => item.id === value.currentId))) {
    throw new Error("Saved bucket-list data is invalid or uses an unsupported version. Clear saved lists to start again.");
  }
  return { version: 1, currentId: value.currentId, documents: value.documents };
}

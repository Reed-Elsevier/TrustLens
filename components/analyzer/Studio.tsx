"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { UPLOAD_LIMITS } from "@/lib/analyze/config";
import type { AnalysisResult, TaskProposal } from "@/lib/analyze/types";
import { addBucketTask, BUCKET_LIMITS, compareRevision, documentAnalysisIds, sameTask, snapshotAnalysis, type BucketTask } from "@/lib/analyze/bucketlist";
import { ApiRequestError, deleteCachedAnalyses, requestReview, uploadPdf } from "@/components/analyzer/api";
import { AnalyzingView } from "@/components/analyzer/AnalyzingView";
import { ChatPanel, type ChatHandle } from "@/components/analyzer/ChatPanel";
import { IntegrityPanel, LegalPanel, StructurePanel } from "@/components/analyzer/DetailPanels";
import { DropZone } from "@/components/analyzer/DropZone";
import { ReviewPanel, type ReviewState } from "@/components/analyzer/ReviewPanel";
import { ScoreCards } from "@/components/analyzer/ScoreCards";
import { PlagiarismPanel } from "@/components/analyzer/PlagiarismPanel";
import { BucketListPanel } from "@/components/analyzer/BucketListPanel";
import { clearBucketStore, updateBucketStore, useBucketStore } from "@/components/analyzer/bucketStore";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, EYEBROW, FOCUS_RING, IconBack, IconChat, IconLens, IconList, IconScale, IconShield } from "@/components/analyzer/ui";

type Phase = { kind: "idle" } | { kind: "analyzing"; fileName: string } | { kind: "done"; result: AnalysisResult };

const MIN_ANALYZING_MS = 1800;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const FEATURES = [
  { icon: <IconShield />, title: "Integrity and plagiarism screening", text: "Manuscript passage overlap against local published abstracts, tortured phrases, chatbot leftovers and missing statements." },
  { icon: <IconScale />, title: "Good-law check", text: "Finds cited cases and statutes, then flags anything overruled, superseded or under criticism." },
  { icon: <IconList />, title: "Bucket list and revision tracking", text: "Save confirmed chat suggestions as tasks, then re-analyze your revised PDF to check which gaps were addressed." },
];

function clientValidation(file: File): string | null {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return "That doesn’t look like a PDF. Please choose a .pdf research paper.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > UPLOAD_LIMITS.maxBytes) return `That PDF is larger than ${UPLOAD_LIMITS.maxBytes / 1024 / 1024} MB. Please try a smaller file.`;
  return null;
}

export function Studio() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewState>({ status: "loading" });
  const controllerRef = useRef<AbortController | null>(null);
  const chatRef = useRef<ChatHandle>(null);
  const bucket = useBucketStore();
  const selectedDocument = bucket.data.documents.find((document) => document.id === bucket.data.currentId);
  const activeDocument = phase.kind === "done" && selectedDocument?.latest.id !== phase.result.id ? undefined : selectedDocument;
  const [confirmClear, setConfirmClear] = useState(false);
  const [revisionNotice, setRevisionNotice] = useState<string | null>(null);
  const [allowAi, setAllowAi] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [privacyNotice, setPrivacyNotice] = useState<string | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  // Stops the browser from navigating away to display a PDF that is dropped outside the drop zone.
  useEffect(() => {
    if (phase.kind !== "idle") return;
    const block = (event: DragEvent) => event.preventDefault();
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, [phase.kind]);

  async function loadReview(id: string, signal: AbortSignal, aiConsent = allowAi) {
    setReview({ status: "loading" });
    try {
      const data = await requestReview(id, signal, aiConsent);
      if (!signal.aborted) setReview({ status: "ready", data });
    } catch (caught) {
      if (signal.aborted) return;
      setReview({ status: "error", message: caught instanceof ApiRequestError ? caught.message : "The review couldn’t be loaded." });
    }
  }

  async function analyze(file: File, revisionId?: string) {
    const problem = clientValidation(file);
    if (problem) {
      setError(problem);
      return;
    }
    controllerRef.current?.abort();
    const previousPhase = phase;
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    setRevisionNotice(null);
    setPhase({ kind: "analyzing", fileName: file.name });
    try {
      const [result] = await Promise.all([uploadPdf(file, controller.signal), wait(MIN_ANALYZING_MS)]);
      if (controller.signal.aborted) return;
      const latest = snapshotAnalysis(result);
      const saved = updateBucketStore((data) => {
        if (revisionId) {
          const document = data.documents.find((entry) => entry.id === revisionId);
          if (!document) throw new Error("The original bucket list is no longer available. Start a new analysis instead.");
          return { ...data, currentId: revisionId, documents: data.documents.map((entry) => entry.id === revisionId ? compareRevision(entry, latest) : entry) };
        }
        if (data.documents.length >= BUCKET_LIMITS.documents) throw new Error(`The ${BUCKET_LIMITS.documents}-document limit has been reached. Delete a saved list before starting another.`);
        const id = crypto.randomUUID();
        return { ...data, currentId: id, documents: [...data.documents, { id, analysisIds: [latest.id], latest, tasks: [] }] };
      });
      if (revisionId && !saved) {
        setPhase(previousPhase);
        if (previousPhase.kind === "done") void loadReview(previousPhase.result.id, controller.signal);
        return;
      }
      if (revisionId && selectedDocument?.latest.id === result.id) setRevisionNotice("This is the same PDF as the last analysis. No content changes were detected; the baseline and tasks are unchanged.");
      setPhase({ kind: "done", result });
      window.scrollTo({ top: 0, behavior: "smooth" });
      void loadReview(result.id, controller.signal);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setPhase(revisionId ? previousPhase : { kind: "idle" });
      setError(caught instanceof ApiRequestError ? caught.message : "We couldn’t reach the server. Please try again.");
      if (revisionId && previousPhase.kind === "done") void loadReview(previousPhase.result.id, controller.signal);
    }
  }

  async function analyzeSample() {
    try {
      const response = await fetch("/sample-paper.pdf");
      if (!response.ok) throw new Error("missing sample");
      void analyze(new File([await response.blob()], "sample-paper.pdf", { type: "application/pdf" }));
    } catch {
      setError("The sample paper couldn’t be loaded.");
    }
  }

  function reset() {
    controllerRef.current?.abort();
    setPhase({ kind: "idle" });
    setError(null);
    setRevisionNotice(null);
  }

  function addTask(proposal: TaskProposal): boolean {
    if (!activeDocument || deleting) return false;
    return updateBucketStore((data) => ({
      ...data, documents: data.documents.map((document) => document.id === activeDocument.id ? addBucketTask(document, proposal, crypto.randomUUID()) : document),
    }));
  }

  function changeTask(task: BucketTask) {
    if (!activeDocument || deleting) return;
    updateBucketStore((data) => ({
      ...data, documents: data.documents.map((document) => document.id === activeDocument.id ? { ...document, tasks: document.tasks.map((entry) => entry.id === task.id ? task : entry) } : document),
    }));
  }

  function retryReview(result: AnalysisResult, aiConsent = allowAi) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    void loadReview(result.id, controller.signal, aiConsent);
  }

  async function deleteDocument() {
    if (!activeDocument || deleting) return;
    controllerRef.current?.abort();
    setDeleting(true);
    setError(null);
    try {
      await deleteCachedAnalyses(documentAnalysisIds(activeDocument));
      if (updateBucketStore((data) => ({ ...data, currentId: null, documents: data.documents.filter((document) => document.id !== activeDocument.id) }))) {
        reset();
        setPrivacyNotice("The saved bucket list and its reachable server-side cached analyses were deleted. Previously sent AI requests cannot be recalled.");
      }
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : "Could not delete the server cache. The saved list was kept; please try again.");
    } finally {
      setDeleting(false);
    }
  }

  const bucketPanel = activeDocument && bucket.ready && !bucket.blocked ? (
    <BucketListPanel
      key={activeDocument.id}
      document={activeDocument}
      busy={phase.kind === "analyzing" || deleting}
      onRevision={(file) => void analyze(file, activeDocument.id)}
      onAdd={addTask}
      onChange={changeTask}
      onDelete={(id) => updateBucketStore((data) => ({ ...data, documents: data.documents.map((document) => document.id === activeDocument.id ? { ...document, tasks: document.tasks.filter((task) => task.id !== id) } : document) }))}
      onDeleteDocument={() => void deleteDocument()}
    />
  ) : null;

  return (
    <div className="relative isolate min-h-screen overflow-x-clip">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem]">
        <div className="bg-glow absolute inset-0" />
        <div className="bg-grid absolute inset-0" />
      </div>

      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <button type="button" onClick={reset} className={`flex items-center gap-2.5 rounded-md ${FOCUS_RING}`} aria-label="TrustLens home">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-canvas">
              <IconLens className="h-4 w-4" strokeWidth={2.4} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-bright">TrustLens</span>
          </button>
          {phase.kind === "done" ? (
            <button type="button" onClick={reset} className={`${BUTTON_SECONDARY} py-1.5`}>
              <IconBack className="h-4 w-4" /> New analysis
            </button>
          ) : (
            <p className={`hidden sm:block ${EYEBROW}`}>Integrity · Legal · Review</p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <section aria-label="Privacy settings" className="mt-4 rounded-lg border border-line bg-panel p-3 text-xs leading-relaxed text-muted">
          <label className="flex items-start gap-2 text-sm text-bright">
            <input type="checkbox" checked={allowAi} disabled={phase.kind === "analyzing" || deleting} className={`mt-1 accent-accent ${FOCUS_RING}`} onChange={(event) => {
              const consent = event.target.checked;
              setAllowAi(consent);
              if (phase.kind === "done") retryReview(phase.result, consent);
            }} />
            I agree to send analysis extracts and chat messages to Claude via AWS Bedrock for AI review and chat.
          </label>
          <p className="mt-2">{allowAi ? "AI processing is on for this tab until you turn it off or reload." : "AI processing is off by default. Screening, rule-based chat and tasks still work on the app server; no model request is made."} Switching modes resets the current chat; requests already sent cannot be recalled.</p>
          <p className="mt-1">PDFs are processed on the server in memory. Task metadata is saved in this browser, not an account. Do not upload confidential or personal data to this unauthenticated demo. <Link href="/privacy" target="_blank" rel="noreferrer" className={`text-accent underline ${FOCUS_RING}`}>Data privacy and usage policy</Link></p>
        </section>
        {privacyNotice ? <p role="status" className="mt-3 text-sm text-ink">{privacyNotice}</p> : null}
        {bucket.error ? (
          <div role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {bucket.error} No failed changes have been saved.
            {bucket.blocked ? (
              confirmClear ? <div className="mt-2 flex gap-3"><span>Remove all browser-saved lists?</span><button type="button" onClick={() => { if (clearBucketStore()) setConfirmClear(false); }} className={FOCUS_RING}>Confirm clear</button><button type="button" onClick={() => setConfirmClear(false)} className={FOCUS_RING}>Cancel</button></div>
                : <button type="button" onClick={() => setConfirmClear(true)} className={`ml-3 underline ${FOCUS_RING}`}>Clear saved lists</button>
            ) : null}
          </div>
        ) : null}
        {error && phase.kind !== "idle" ? <p role="alert" className="mt-4 rounded-lg border border-danger/30 p-3 text-sm text-danger">{error}</p> : null}
        {revisionNotice ? <p role="status" className="mt-4 text-sm text-ink">{revisionNotice}</p> : null}
        {bucket.ready && bucket.data.documents.length && phase.kind === "idle" ? (
          <div className="mt-6 space-y-4">
            <label className="block text-sm text-muted">Saved bucket lists
              <select value={bucket.data.currentId ?? ""} disabled={deleting} onChange={(event) => updateBucketStore((data) => ({ ...data, currentId: event.target.value || null }))} className="ml-3 max-w-full rounded-lg border border-line bg-panel p-2 text-bright">
                <option value="">Select a saved paper</option>
                {bucket.data.documents.map((document) => <option key={document.id} value={document.id}>{document.latest.fileName} · {document.latest.analyzedAt.slice(0, 16).replace("T", " ")} UTC</option>)}
              </select>
            </label>
            {bucketPanel}
          </div>
        ) : null}
        {phase.kind === "idle" ? (
          <div className="pt-16 sm:pt-24">
            <div className="animate-rise mx-auto max-w-3xl text-center">
              <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-accent">Manuscript screening for publishers</p>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-bright sm:text-6xl sm:leading-[1.05]">
                Drop a paper.
                <br />
                <span className="text-accent">Know what to trust.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-ink sm:text-lg">
                Screen a research PDF for integrity red flags, test every legal authority it cites, and get a clear list of what the paper still needs.
              </p>
            </div>

            <div className="animate-rise mt-12 [animation-delay:100ms]">
              <DropZone onFile={(file) => void analyze(file)} onSample={() => void analyzeSample()} error={error} />
            </div>

            <ul className="mx-auto mt-20 grid max-w-5xl gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
              {FEATURES.map((feature, index) => (
                <li key={feature.title} className="bg-panel p-6 transition-colors hover:bg-raised">
                  <div className="flex items-center justify-between">
                    <span className="text-accent [&>svg]:h-5 [&>svg]:w-5">{feature.icon}</span>
                    <span className="font-mono text-xs text-muted">0{index + 1}</span>
                  </div>
                  <h2 className="mt-4 font-semibold text-bright">{feature.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{feature.text}</p>
                </li>
              ))}
            </ul>
            <p className="mx-auto mt-8 max-w-xl text-center text-xs leading-relaxed text-muted">
              PDFs are read in server memory and never saved by the app. Analysis extracts and chat messages are sent to the AI model only if you opt in above. Synthetic demo data. Research support, not legal advice.
            </p>
          </div>
        ) : null}

        {phase.kind === "analyzing" ? (
          <div className="pt-24">
            <AnalyzingView fileName={phase.fileName} />
          </div>
        ) : null}

        {phase.kind === "done" ? (
          <div className="pt-8">
            <div className="animate-rise mb-6 flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <p className={EYEBROW}>Analysis report</p>
                <h1 className="mt-2 line-clamp-2 text-2xl font-semibold tracking-tight text-bright sm:text-3xl">{phase.result.file.title ?? phase.result.file.name}</h1>
                <p className="mt-2 font-mono text-xs text-muted">
                  {phase.result.file.name} · {phase.result.file.pages} page{phase.result.file.pages === 1 ? "" : "s"} · {phase.result.file.words.toLocaleString()} words · {(phase.result.file.sizeBytes / 1024).toFixed(0)} KB
                  {phase.result.file.truncated ? " · text truncated for analysis" : ""}
                </p>
              </div>
              <a href="#chat" className={`${BUTTON_PRIMARY} lg:hidden`}>
                <IconChat className="h-4 w-4" /> Ask TrustLens
              </a>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
              <div className="min-w-0 space-y-6">
                <ScoreCards result={phase.result} />
                <PlagiarismPanel result={phase.result} />
                {bucketPanel}
                <ReviewPanel state={review} onRetry={() => retryReview(phase.result)} onAsk={(question) => chatRef.current?.ask(question)} />
                <div className="grid gap-6 2xl:grid-cols-2">
                  <IntegrityPanel result={phase.result} />
                  <LegalPanel result={phase.result} />
                </div>
                <StructurePanel result={phase.result} />
                <p className="text-center text-xs text-muted">{phase.result.notice}</p>
              </div>
              <aside className="lg:sticky lg:top-20 lg:self-start">
                <ChatPanel
                  key={`${phase.result.id}:${allowAi}`}
                  result={phase.result}
                  handle={chatRef}
                  onAddTask={addTask}
                  hasTask={(proposal) => activeDocument?.tasks.some((task) => sameTask(task, proposal)) ?? false}
                  canAddTask={Boolean(activeDocument) && bucket.ready && !bucket.blocked && !deleting}
                  allowAi={allowAi}
                />
              </aside>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { UPLOAD_LIMITS } from "@/lib/analyze/config";
import type { AnalysisResult } from "@/lib/analyze/types";
import { ApiRequestError, requestReview, uploadPdf } from "@/components/analyzer/api";
import { AnalyzingView } from "@/components/analyzer/AnalyzingView";
import { ChatPanel, type ChatHandle } from "@/components/analyzer/ChatPanel";
import { IntegrityPanel, LegalPanel, StructurePanel } from "@/components/analyzer/DetailPanels";
import { DropZone } from "@/components/analyzer/DropZone";
import { ReviewPanel, type ReviewState } from "@/components/analyzer/ReviewPanel";
import { ScoreCards } from "@/components/analyzer/ScoreCards";
import { Chip, IconBack, IconBook, IconChat, IconLens, IconScale, IconShield, IconSpark } from "@/components/analyzer/ui";

type Phase = { kind: "idle" } | { kind: "analyzing"; fileName: string } | { kind: "done"; result: AnalysisResult };

const MIN_ANALYZING_MS = 1800;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  async function loadReview(id: string, signal: AbortSignal) {
    setReview({ status: "loading" });
    try {
      const data = await requestReview(id, signal);
      if (!signal.aborted) setReview({ status: "ready", data });
    } catch (caught) {
      if (signal.aborted) return;
      setReview({ status: "error", message: caught instanceof ApiRequestError ? caught.message : "The AI review couldn’t be loaded." });
    }
  }

  async function analyze(file: File) {
    const problem = clientValidation(file);
    if (problem) {
      setError(problem);
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    setPhase({ kind: "analyzing", fileName: file.name });
    try {
      const [result] = await Promise.all([uploadPdf(file, controller.signal), wait(MIN_ANALYZING_MS)]);
      if (controller.signal.aborted) return;
      setPhase({ kind: "done", result });
      window.scrollTo({ top: 0, behavior: "smooth" });
      void loadReview(result.id, controller.signal);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setPhase({ kind: "idle" });
      setError(caught instanceof ApiRequestError ? caught.message : "We couldn’t reach the server. Please try again.");
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
  }

  function retryReview(result: AnalysisResult) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    void loadReview(result.id, controller.signal);
  }

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] overflow-hidden">
        <div className="animate-aurora absolute -left-24 -top-24 h-96 w-96 rounded-full bg-indigo-400/30 blur-3xl dark:bg-indigo-600/25" />
        <div className="animate-aurora absolute -right-16 top-0 h-96 w-96 rounded-full bg-fuchsia-400/25 blur-3xl [animation-delay:-5s] dark:bg-fuchsia-600/20" />
        <div className="animate-aurora absolute left-1/3 top-32 h-72 w-72 rounded-full bg-cyan-300/25 blur-3xl [animation-delay:-9s] dark:bg-cyan-500/15" />
      </div>

      <header className="sticky top-0 z-20 border-b border-slate-200/60 bg-background/70 backdrop-blur-lg dark:border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <button type="button" onClick={reset} className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30" aria-label="TrustLens home">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/30"><IconLens className="h-5 w-5" /></span>
            <span className="text-lg font-bold tracking-tight">TrustLens</span>
          </button>
          {phase.kind === "done" ? (
            <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium shadow-sm transition hover:border-indigo-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30 dark:border-white/10 dark:bg-white/5">
              <IconBack className="h-4 w-4" /> Analyze another paper
            </button>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Chip tone="indigo">Publishing integrity</Chip>
              <Chip tone="indigo">Legal research</Chip>
              <Chip tone="indigo">AI review</Chip>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        {phase.kind === "idle" ? (
          <div className="pt-12 sm:pt-20">
            <div className="animate-rise mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/70 px-3.5 py-1 text-xs font-medium text-indigo-700 backdrop-blur dark:border-indigo-400/30 dark:bg-white/5 dark:text-indigo-200">
                <IconSpark className="h-3.5 w-3.5" /> AI-assisted manuscript screening
              </span>
              <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-6xl">
                Drop a paper.{" "}
                <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent dark:from-indigo-300 dark:via-violet-300 dark:to-fuchsia-300">Know what to trust.</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg dark:text-slate-300">
                TrustLens screens a research PDF for publishing-integrity red flags, tests every legal authority it cites, tells you exactly what the paper lacks, then lets you chat with the findings.
              </p>
            </div>

            <div className="mt-10 animate-rise [animation-delay:120ms]">
              <DropZone onFile={(file) => void analyze(file)} onSample={() => void analyzeSample()} error={error} />
            </div>

            <ul className="mx-auto mt-16 grid max-w-5xl gap-4 sm:grid-cols-3">
              {[
                { icon: <IconShield />, title: "Integrity screening", text: "Similarity to published papers, tortured phrases, AI leftovers and missing statements." },
                { icon: <IconScale />, title: "Legal good-law check", text: "Matches cited cases and statutes, then flags overruled, superseded or criticised authorities." },
                { icon: <IconChat />, title: "Gaps, needs & chat", text: "A prioritised to-do list for the authors, plus an assistant that answers from the evidence." },
              ].map((feature) => (
                <li key={feature.title} className="animate-rise rounded-2xl border border-slate-200/70 bg-white/60 p-5 backdrop-blur transition hover:-translate-y-1 hover:shadow-lg dark:border-white/10 dark:bg-white/5">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white [&>svg]:h-5 [&>svg]:w-5">{feature.icon}</span>
                  <h2 className="mt-3 font-semibold">{feature.title}</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{feature.text}</p>
                </li>
              ))}
            </ul>
            <p className="mx-auto mt-10 max-w-xl text-center text-xs text-slate-500 dark:text-slate-400">
              PDFs are read in memory and never saved. Extracts of the analysis are shared with the AI model to write the review and answer chat questions. Synthetic demo data. Research support, not legal advice.
            </p>
          </div>
        ) : null}

        {phase.kind === "analyzing" ? <div className="pt-20"><AnalyzingView fileName={phase.fileName} /></div> : null}

        {phase.kind === "done" ? (
          <div className="pt-8">
            <div className="animate-rise mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="flex items-start gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
                  <IconBook className="mt-1 h-7 w-7 shrink-0 text-indigo-500" />
                  <span className="line-clamp-2">{phase.result.file.title ?? phase.result.file.name}</span>
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {phase.result.file.name} · {phase.result.file.pages} page{phase.result.file.pages === 1 ? "" : "s"} · {phase.result.file.words.toLocaleString()} words · {(phase.result.file.sizeBytes / 1024).toFixed(0)} KB
                  {phase.result.file.truncated ? " · text truncated for analysis" : ""}
                </p>
              </div>
              <a href="#chat" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/30 lg:hidden">
                <IconChat className="h-4 w-4" /> Ask TrustLens
              </a>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
              <div className="min-w-0 space-y-6">
                <ScoreCards result={phase.result} />
                <ReviewPanel state={review} onRetry={() => retryReview(phase.result)} onAsk={(question) => chatRef.current?.ask(question)} />
                <div className="grid gap-6 2xl:grid-cols-2">
                  <IntegrityPanel result={phase.result} />
                  <LegalPanel result={phase.result} />
                </div>
                <StructurePanel result={phase.result} />
                <p className="text-center text-xs text-slate-500 dark:text-slate-400">{phase.result.notice}</p>
              </div>
              <aside className="lg:sticky lg:top-20 lg:self-start">
                <ChatPanel key={phase.result.id} result={phase.result} handle={chatRef} />
              </aside>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

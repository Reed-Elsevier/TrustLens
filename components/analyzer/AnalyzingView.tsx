"use client";

import { useEffect, useState } from "react";
import { Card, EYEBROW, IconCheck, IconFile } from "@/components/analyzer/ui";

const STEPS = [
  { title: "Reading the PDF", detail: "Extracting text, sections and references" },
  { title: "Screening integrity and plagiarism", detail: "Body passage overlap, red-flag wording, required statements" },
  { title: "Checking legal authorities", detail: "Matching citations and testing whether they are still good law" },
  { title: "Preparing the report", detail: "Listing what the paper lacks and needs" },
];

// The request is a single call; steps advance on a timer and hold on the last one until the response arrives.
export function AnalyzingView({ fileName }: { fileName: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((current) => Math.min(current + 1, STEPS.length - 1)), 900);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="animate-rise mx-auto w-full max-w-xl" role="status" aria-live="polite">
      <Card className="p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <p className={EYEBROW}>Analyzing</p>
          <p className="font-mono text-xs tabular-nums text-muted">
            {step + 1} / {STEPS.length}
          </p>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-canvas px-3.5 py-2.5">
          <IconFile className="h-4 w-4 shrink-0 text-accent" />
          <span className="truncate font-mono text-sm text-bright">{fileName}</span>
        </div>
        <div className="mt-5 h-1 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-deep to-accent transition-[width] duration-700"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <ol className="mt-6 space-y-4">
          {STEPS.map((item, index) => {
            const state = index < step ? "done" : index === step ? "active" : "todo";
            return (
              <li key={item.title} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                    state === "done" ? "border-accent bg-accent text-canvas" : state === "active" ? "border-accent" : "border-line-strong"
                  }`}
                >
                  {state === "done" ? <IconCheck className="h-3 w-3" strokeWidth={3} /> : null}
                  {state === "active" ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> : null}
                </span>
                <div>
                  <p className={`text-sm font-medium ${state === "todo" ? "text-muted" : "text-bright"}`}>{item.title}</p>
                  <p className="text-xs text-muted">{item.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}

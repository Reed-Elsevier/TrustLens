"use client";

import { useEffect, useState } from "react";
import { Card, IconCheck, IconFile } from "@/components/analyzer/ui";

const STEPS = [
  { title: "Reading your PDF", detail: "Extracting text, sections and references" },
  { title: "Screening publishing integrity", detail: "Similarity, red-flag wording, required statements" },
  { title: "Checking legal authorities", detail: "Matching citations and testing if they are still good law" },
  { title: "Preparing your report", detail: "Listing what the paper lacks and needs" },
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
        <div className="flex items-center gap-3 rounded-xl bg-slate-100 px-4 py-3 dark:bg-white/5">
          <IconFile className="h-5 w-5 shrink-0 text-indigo-500" />
          <span className="truncate text-sm font-medium">{fileName}</span>
        </div>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 transition-[width] duration-700" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
        <ol className="mt-6 space-y-4">
          {STEPS.map((item, index) => {
            const state = index < step ? "done" : index === step ? "active" : "todo";
            return (
              <li key={item.title} className={`flex items-start gap-3 transition-opacity ${state === "todo" ? "opacity-40" : "opacity-100"}`}>
                <span
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-white ${
                    state === "done" ? "bg-emerald-500" : state === "active" ? "bg-gradient-to-br from-indigo-500 to-fuchsia-500" : "bg-slate-300 dark:bg-white/20"
                  }`}
                >
                  {state === "done" ? (
                    <IconCheck className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : state === "active" ? (
                    <span className="h-2.5 w-2.5 animate-ping rounded-full bg-white" />
                  ) : null}
                </span>
                <div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { FindingArea, ReviewResponse } from "@/lib/analyze/types";
import { Card, Chip, IconAlert, IconCheck, IconChat, IconSpark, SEVERITY_BORDER, SectionTitle, SeverityBadge } from "@/components/analyzer/ui";

export type ReviewState = { status: "loading" } | { status: "ready"; data: ReviewResponse } | { status: "error"; message: string };

const AREA_LABEL: Record<FindingArea, string> = { integrity: "Integrity", legal: "Legal", structure: "Structure", references: "References" };

function Skeleton() {
  return (
    <div className="mt-5 space-y-3" aria-hidden="true">
      <div className="skeleton h-6 w-3/4 rounded-lg" />
      <div className="skeleton h-4 w-full rounded-lg" />
      <div className="skeleton h-4 w-5/6 rounded-lg" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className="skeleton h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function Needs({ items }: { items: string[] }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  const toggle = (index: number) =>
    setDone((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">What the paper needs</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">{done.size} of {items.length} done</span>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item, index) => (
          <li key={item}>
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${done.has(index) ? "border-emerald-200 bg-emerald-50/70 text-slate-500 line-through dark:border-emerald-500/20 dark:bg-emerald-500/5" : "border-slate-200 bg-white/60 hover:border-indigo-300 dark:border-white/10 dark:bg-white/5"}`}>
              <input type="checkbox" checked={done.has(index)} onChange={() => toggle(index)} className="peer sr-only" />
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-slate-300 text-white transition peer-checked:border-emerald-500 peer-checked:bg-emerald-500 peer-focus-visible:ring-4 peer-focus-visible:ring-indigo-500/30 dark:border-white/20">
                {done.has(index) ? <IconCheck className="h-3.5 w-3.5" strokeWidth={3} /> : null}
              </span>
              <span>{item}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReviewPanel({ state, onRetry, onAsk }: { state: ReviewState; onRetry: () => void; onAsk: (question: string) => void }) {
  const source = state.status === "ready" ? state.data.source : null;
  return (
    <Card className="animate-rise p-5 sm:p-6" aria-labelledby="review-title">
      <SectionTitle
        icon={<IconSpark />}
        title="AI review: what’s lacking & what it needs"
        hint="Prioritised from the checks below; numbers come from code, not the model."
        right={
          source ? (
            <Chip tone={source === "claude" ? "indigo" : "slate"}>{source === "claude" ? "AI-written" : "Rule-based summary"}</Chip>
          ) : null
        }
      />
      <span id="review-title" className="sr-only">AI review</span>

      {state.status === "loading" ? (
        <div role="status" aria-live="polite">
          <p className="mt-5 flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-300">
            <span className="h-2 w-2 animate-ping rounded-full bg-indigo-500" /> TrustLens AI is reading the findings…
          </p>
          <Skeleton />
        </div>
      ) : null}

      {state.status === "error" ? (
        <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30">
          <span className="flex items-center gap-2"><IconAlert className="h-4 w-4" /> {state.message}</span>
          <button type="button" onClick={onRetry} className="rounded-lg bg-white px-3 py-1.5 font-medium shadow-sm ring-1 ring-rose-200 hover:bg-rose-100 dark:bg-white/10 dark:ring-white/10">Retry</button>
        </div>
      ) : null}

      {state.status === "ready" ? (
        <div className="mt-5 space-y-6">
          <div className="rounded-2xl bg-gradient-to-br from-indigo-500/10 via-violet-500/10 to-fuchsia-500/10 p-4 ring-1 ring-indigo-500/10">
            <p className="text-lg font-semibold leading-snug tracking-tight">{state.data.review.headline}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{state.data.review.assessment}</p>
          </div>

          <div>
            <h3 className="text-sm font-semibold">What’s lacking <span className="font-normal text-slate-500">({state.data.review.gaps.length})</span></h3>
            {state.data.review.gaps.length === 0 ? (
              <p className="mt-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">No gaps were identified. 🎉</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {state.data.review.gaps.map((gap, index) => (
                  <li key={`${gap.title}-${index}`}>
                    <details open={index < 2} className={`group rounded-xl border border-l-4 border-slate-200 bg-white/70 open:shadow-sm dark:border-white/10 dark:bg-white/5 ${SEVERITY_BORDER[gap.severity]}`}>
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-3.5 [&::-webkit-details-marker]:hidden">
                        <SeverityBadge severity={gap.severity} />
                        <Chip>{AREA_LABEL[gap.area]}</Chip>
                        <span className="min-w-0 flex-1 text-sm font-semibold">{gap.title}</span>
                        <span className="text-slate-400 transition group-open:rotate-180" aria-hidden="true">⌄</span>
                      </summary>
                      <div className="space-y-2.5 border-t border-slate-100 p-3.5 text-sm dark:border-white/5">
                        <p><span className="font-semibold">Missing: </span>{gap.whatIsMissing}</p>
                        <p><span className="font-semibold">Why it matters: </span>{gap.whyItMatters}</p>
                        <p className="rounded-lg bg-emerald-50 p-2.5 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"><span className="font-semibold">How to fix: </span>{gap.howToFix}</p>
                        <button type="button" onClick={() => onAsk(`Tell me more about: ${gap.title}`)} className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300">
                          <IconChat className="h-3.5 w-3.5" /> Ask TrustLens about this
                        </button>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {state.data.review.needs.length > 0 ? <Needs items={state.data.review.needs} /> : null}

          <div className="grid gap-5 sm:grid-cols-2">
            {state.data.review.questionsForAuthors.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold">Questions for the authors</h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600 marker:text-indigo-400 dark:text-slate-300">
                  {state.data.review.questionsForAuthors.map((question) => <li key={question}>{question}</li>)}
                </ul>
              </div>
            ) : null}
            {state.data.review.strengths.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold">What’s working</h3>
                <ul className="mt-2 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                  {state.data.review.strengths.map((strength) => (
                    <li key={strength} className="flex gap-2"><IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{strength}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

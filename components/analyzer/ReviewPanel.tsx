"use client";

import { useState } from "react";
import type { FindingArea, ReviewResponse } from "@/lib/analyze/types";
import { Card, Chip, EYEBROW, FOCUS_RING, IconAlert, IconChat, IconCheck, IconChevron, IconList, SEVERITY_BORDER, SectionTitle, SeverityBadge, BUTTON_SECONDARY } from "@/components/analyzer/ui";

export type ReviewState = { status: "loading" } | { status: "ready"; data: ReviewResponse } | { status: "error"; message: string };

const AREA_LABEL: Record<FindingArea, string> = { integrity: "Integrity", legal: "Legal", structure: "Structure", references: "References" };

function Skeleton() {
  return (
    <div className="mt-5 space-y-3" aria-hidden="true">
      <div className="skeleton h-5 w-3/4 rounded-md" />
      <div className="skeleton h-3.5 w-full rounded-md" />
      <div className="skeleton h-3.5 w-5/6 rounded-md" />
      <div className="mt-6 space-y-2.5">
        {[0, 1, 2].map((n) => (
          <div key={n} className="skeleton h-14 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function SubHeading({ title, count }: { title: string; count?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className={EYEBROW}>{title}</h3>
      {count ? <span className="font-mono text-xs tabular-nums text-muted">{count}</span> : null}
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
      <SubHeading title="What the paper needs" count={`${done.size}/${items.length} done`} />
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(done.size / items.length) * 100}%` }} />
      </div>
      <ul className="mt-3 space-y-1.5">
        {items.map((item, index) => (
          <li key={item}>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                done.has(index) ? "border-line bg-canvas text-muted line-through" : "border-line bg-canvas text-ink hover:border-line-strong"
              }`}
            >
              <input type="checkbox" checked={done.has(index)} onChange={() => toggle(index)} className="peer sr-only" />
              <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border border-line-strong text-canvas transition peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas">
                {done.has(index) ? <IconCheck className="h-3 w-3" strokeWidth={3.5} /> : null}
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
    <Card className="animate-rise p-5 sm:p-6" aria-label="Review: what is lacking and what the paper needs">
      <SectionTitle
        icon={<IconList />}
        title="Review: what’s lacking and what it needs"
        hint="Prioritised from the checks below. Figures come from code, not the model."
        right={source ? <Chip tone={source === "claude" ? "accent" : "neutral"}>{source === "claude" ? "AI-written" : source === "local" ? "AI off" : "Rule-based"}</Chip> : null}
      />

      {state.status === "loading" ? (
        <div role="status" aria-live="polite">
          <p className="mt-5 flex items-center gap-2 text-sm text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Writing the review from the findings…
          </p>
          <Skeleton />
        </div>
      ) : null}

      {state.status === "error" ? (
        <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger">
          <span className="flex items-center gap-2">
            <IconAlert className="h-4 w-4" /> {state.message}
          </span>
          <button type="button" onClick={onRetry} className={BUTTON_SECONDARY}>
            Retry
          </button>
        </div>
      ) : null}

      {state.status === "ready" ? (
        <div className="mt-5 space-y-7">
          <div className="rounded-r-lg border-l-2 border-accent bg-canvas px-4 py-3.5">
            <p className="text-lg font-semibold leading-snug tracking-tight text-bright">{state.data.review.headline}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink">{state.data.review.assessment}</p>
          </div>

          <div>
            <SubHeading title="What’s lacking" count={String(state.data.review.gaps.length)} />
            {state.data.review.gaps.length === 0 ? (
              <p className="mt-3 rounded-lg border border-accent-deep/60 bg-accent/[0.06] p-3.5 text-sm text-accent">No gaps were identified.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {state.data.review.gaps.map((gap, index) => (
                  <li key={`${gap.title}-${index}`}>
                    <details open={index < 2} className={`group rounded-lg border border-l-2 border-line bg-canvas ${SEVERITY_BORDER[gap.severity]}`}>
                      <summary className={`flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-3.5 py-3 transition-colors hover:bg-raised [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}>
                        <SeverityBadge severity={gap.severity} />
                        <span className="min-w-0 flex-1 text-sm font-medium text-bright">{gap.title}</span>
                        <span className="hidden font-mono text-[11px] uppercase tracking-wider text-muted sm:inline">{AREA_LABEL[gap.area]}</span>
                        <IconChevron className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                      </summary>
                      <dl className="grid gap-3 border-t border-line px-3.5 py-3.5 text-sm">
                        <div>
                          <dt className="text-xs text-muted">Missing</dt>
                          <dd className="mt-0.5 text-ink">{gap.whatIsMissing}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">Why it matters</dt>
                          <dd className="mt-0.5 text-ink">{gap.whyItMatters}</dd>
                        </div>
                        <div className="rounded-md border border-accent-deep/50 bg-accent/[0.05] px-3 py-2.5">
                          <dt className="text-xs font-medium text-accent">How to fix</dt>
                          <dd className="mt-0.5 text-bright">{gap.howToFix}</dd>
                        </div>
                      </dl>
                      <div className="px-3.5 pb-3">
                        <button type="button" onClick={() => onAsk(`Tell me more about: ${gap.title}`)} className={`inline-flex items-center gap-1.5 rounded text-xs font-medium text-accent hover:underline ${FOCUS_RING}`}>
                          <IconChat className="h-3.5 w-3.5" /> Ask about this
                        </button>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {state.data.review.needs.length > 0 ? <Needs items={state.data.review.needs} /> : null}

          <div className="grid gap-6 sm:grid-cols-2">
            {state.data.review.questionsForAuthors.length > 0 ? (
              <div>
                <SubHeading title="Questions for the authors" />
                <ol className="mt-3 space-y-2.5 text-sm text-ink">
                  {state.data.review.questionsForAuthors.map((question, index) => (
                    <li key={question} className="flex gap-3">
                      <span className="font-mono text-xs leading-5 text-muted">Q{index + 1}</span>
                      <span>{question}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {state.data.review.strengths.length > 0 ? (
              <div>
                <SubHeading title="What’s working" />
                <ul className="mt-3 space-y-2.5 text-sm text-ink">
                  {state.data.review.strengths.map((strength) => (
                    <li key={strength} className="flex gap-2.5">
                      <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      {strength}
                    </li>
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

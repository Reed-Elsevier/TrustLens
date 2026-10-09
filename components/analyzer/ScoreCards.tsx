import type { AnalysisResult } from "@/lib/analyze/types";
import { Card, LEVEL_TONE, ScoreRing } from "@/components/analyzer/ui";

const GOOD = { ring: "stroke-emerald-500", text: "text-emerald-600 dark:text-emerald-400" };
const OKAY = { ring: "stroke-amber-500", text: "text-amber-600 dark:text-amber-400" };
const BAD = { ring: "stroke-rose-500", text: "text-rose-600 dark:text-rose-400" };
const NEUTRAL = { ring: "stroke-slate-400", text: "text-slate-400" };

function Stat({ title, caption, detail, value, display, tone }: { title: string; caption: string; detail: string; value: number | null; display: string; tone: typeof GOOD }) {
  return (
    <Card className="animate-rise @container p-4 sm:p-5">
      <div className="flex flex-col items-center gap-3 text-center @xs:flex-row @xs:gap-4 @xs:text-left">
        <ScoreRing value={value} display={display} ringClass={tone.ring} textClass={tone.text} size={96} />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
          <p className={`text-base font-semibold ${tone.text}`}>{caption}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
      </div>
    </Card>
  );
}

export function ScoreCards({ result }: { result: AnalysisResult }) {
  const { integrity, legal, findings, completenessScore } = result;
  const level = LEVEL_TONE[integrity.level];
  const legalPercent = legal.currencyRate === null ? null : Math.round(legal.currencyRate * 100);
  const high = findings.filter((finding) => finding.severity === "high").length;
  const completenessTone = completenessScore >= 80 ? GOOD : completenessScore >= 50 ? OKAY : BAD;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Stat
        title="Integrity risk"
        caption={level.label}
        detail={`${integrity.anomalies.length} red-flag type(s) · ${integrity.signals.filter((s) => s.points > 0).length} of ${integrity.signals.length} signals raised`}
        value={integrity.score}
        display={String(integrity.score)}
        tone={{ ring: level.ring, text: level.text }}
      />
      <Stat
        title="Legal currency"
        caption={legal.relevance === "none" ? "Not a legal paper" : legalPercent === null ? "Nothing verified" : "Still good law"}
        detail={
          legal.relevance === "none"
            ? "No legal authorities detected"
            : `${legal.counts.goodLaw} of ${legal.counts.verified} verified · ${legal.counts.unverified} unverified`
        }
        value={legalPercent}
        display={legalPercent === null ? "–" : `${legalPercent}%`}
        tone={legalPercent === null ? NEUTRAL : legalPercent === 100 ? GOOD : legalPercent >= 70 ? OKAY : BAD}
      />
      <Stat
        title="Completeness"
        caption={completenessScore >= 80 ? "Well structured" : completenessScore >= 50 ? "Gaps to close" : "Needs work"}
        detail={`${findings.length} gap${findings.length === 1 ? "" : "s"} found · ${high} high severity`}
        value={completenessScore}
        display={`${completenessScore}%`}
        tone={completenessTone}
      />
    </div>
  );
}

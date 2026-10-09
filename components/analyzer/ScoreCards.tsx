import type { AnalysisResult } from "@/lib/analyze/types";
import { Card, EYEBROW, LEVEL_TONE, Meter } from "@/components/analyzer/ui";

type ToneStyle = { text: string; bar: string };

const GOOD: ToneStyle = { text: "text-accent", bar: "bg-accent" };
const OKAY: ToneStyle = { text: "text-warn", bar: "bg-warn" };
const BAD: ToneStyle = { text: "text-danger", bar: "bg-danger" };
const NEUTRAL: ToneStyle = { text: "text-muted", bar: "bg-line" };

function Metric({ title, value, display, suffix, caption, detail, tone }: { title: string; value: number | null; display: string; suffix?: string; caption: string; detail: string; tone: ToneStyle }) {
  return (
    <div className="p-5">
      <p className={EYEBROW}>{title}</p>
      <p className="mt-3 flex items-baseline gap-1">
        <span className="font-mono text-4xl font-semibold tabular-nums tracking-tight text-bright">{display}</span>
        {suffix ? <span className="font-mono text-sm text-muted">{suffix}</span> : null}
      </p>
      <p className={`mt-1 text-sm font-medium ${tone.text}`}>{caption}</p>
      <div className="mt-3">
        <Meter value={value ?? 0} max={100} className={tone.bar} />
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-muted">{detail}</p>
    </div>
  );
}

export function ScoreCards({ result }: { result: AnalysisResult }) {
  const { integrity, legal, findings, completenessScore } = result;
  const level = LEVEL_TONE[integrity.level];
  const legalPercent = legal.currencyRate === null ? null : Math.round(legal.currencyRate * 100);
  const high = findings.filter((finding) => finding.severity === "high").length;
  const legalTone = legalPercent === null ? NEUTRAL : legalPercent === 100 ? GOOD : legalPercent >= 70 ? OKAY : BAD;

  return (
    <Card className="animate-rise grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-label="Summary scores">
      <Metric
        title="Integrity risk"
        value={integrity.score}
        display={String(integrity.score)}
        suffix="/100"
        caption={level.label}
        detail={`${integrity.signals.filter((s) => s.points > 0).length} of ${integrity.signals.length} signals raised · ${integrity.anomalies.length} red-flag type(s)`}
        tone={{ text: level.text, bar: level.bar }}
      />
      <Metric
        title="Legal currency"
        value={legalPercent}
        display={legalPercent === null ? "–" : `${legalPercent}%`}
        caption={
          legal.relevance === "none"
            ? "Not a legal paper"
            : legalPercent === null
              ? "Nothing verified"
              : legalPercent === 100
                ? "All still good law"
                : legalPercent >= 70
                  ? "Mostly current"
                  : "Outdated authorities"
        }
        detail={legal.relevance === "none" ? "No legal authorities detected" : `${legal.counts.goodLaw} of ${legal.counts.verified} verified still good law · ${legal.counts.unverified} unverified`}
        tone={legalTone}
      />
      <Metric
        title="Completeness"
        value={completenessScore}
        display={`${completenessScore}%`}
        caption={completenessScore >= 80 ? "Well structured" : completenessScore >= 50 ? "Gaps to close" : "Needs work"}
        detail={`${findings.length} gap${findings.length === 1 ? "" : "s"} found · ${high} high severity`}
        tone={completenessScore >= 80 ? GOOD : completenessScore >= 50 ? OKAY : BAD}
      />
    </Card>
  );
}

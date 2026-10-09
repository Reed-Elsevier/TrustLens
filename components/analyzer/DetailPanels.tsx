import type { ReactNode } from "react";
import type { AnalysisResult } from "@/lib/analyze/types";
import { Card, Chip, EYEBROW, IconAlert, IconBook, IconCheck, IconScale, IconShield, IconX, Meter, SectionTitle, VerdictBadge } from "@/components/analyzer/ui";

const pct = (value: number) => `${Math.round(value * 100)}%`;
const overlapTone = (value: number) => (value >= 0.7 ? "bg-danger" : value >= 0.35 ? "bg-warn" : "bg-accent");

function Divider({ title, icon }: { title: string; icon?: ReactNode }) {
  return (
    <h3 className={`flex items-center gap-2 border-t border-line pt-5 ${EYEBROW}`}>
      {icon}
      {title}
    </h3>
  );
}

export function IntegrityPanel({ result }: { result: AnalysisResult }) {
  const { integrity } = result;
  return (
    <Card className="animate-rise p-5 sm:p-6" aria-label="Publishing integrity">
      <SectionTitle icon={<IconShield />} title="Publishing integrity" hint={`${integrity.score} of 100 risk points. Indicators, not proof of misconduct.`} />
      <ul className="mt-5 space-y-4">
        {integrity.signals.map((signal) => {
          const ratio = signal.maxPoints === 0 ? 0 : signal.points / signal.maxPoints;
          return (
            <li key={signal.key}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-bright">{signal.label}</span>
                <span className="font-mono text-xs tabular-nums text-muted">{signal.applicable ? `${signal.points}/${signal.maxPoints}` : "n/a"}</span>
              </div>
              <div className="mt-2">
                <Meter value={signal.points} max={signal.maxPoints} className={signal.points === 0 ? "bg-accent" : ratio >= 0.5 ? "bg-danger" : "bg-warn"} />
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{signal.evidence}</p>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 space-y-3">
        <Divider title="Closest published papers" />
        {integrity.matches.length === 0 ? (
          <p className="text-sm text-muted">
            {integrity.corpusSize === 0
              ? "No published abstracts are available to compare against."
              : `Compared ${integrity.comparedAgainst === "abstract" ? "the abstract" : "the opening text"} with ${integrity.corpusSize} published abstracts. No overlap found.`}
          </p>
        ) : (
          <ul className="space-y-2">
            {integrity.matches.map((match) => (
              <li key={match.paperId} className="rounded-lg border border-line bg-canvas p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-bright">{match.title ?? match.paperId}</span>
                  <span className="font-mono text-[11px] text-muted">{match.paperId}</span>
                </div>
                <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
                  {[
                    { label: "Topic similarity", value: match.cosine },
                    { label: "Phrases shared", value: match.containment },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div className="mb-1 flex justify-between text-xs text-muted">
                        <span>{label}</span>
                        <span className="font-mono tabular-nums text-ink">{pct(value)}</span>
                      </div>
                      <Meter value={value} max={1} className={overlapTone(value)} />
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {integrity.anomalies.length > 0 ? (
        <div className="mt-6 space-y-3">
          <Divider title="Red flags in the text" icon={<IconAlert className="h-3.5 w-3.5 text-warn" />} />
          <ul className="space-y-2">
            {integrity.anomalies.map((anomaly) => (
              <li key={anomaly.kind} className="rounded-lg border border-warn/25 bg-warn/[0.06] p-3 text-sm">
                <p className="flex items-center justify-between gap-2 text-bright">
                  {anomaly.label}
                  <span className="font-mono text-xs text-warn">×{anomaly.count}</span>
                </p>
                <p className="mt-1.5 border-l border-warn/40 pl-2.5 text-xs italic text-muted">“{anomaly.example}”</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

export function LegalPanel({ result }: { result: AnalysisResult }) {
  const { legal } = result;
  const counts = legal.counts;
  return (
    <Card className="animate-rise p-5 sm:p-6" aria-label="Legal research">
      <SectionTitle icon={<IconScale />} title="Legal research check" hint="Cited authorities tested with the rule-based good-law check" />
      {!legal.available && legal.relevance !== "none" ? (
        <p className="mt-4 rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
          No legal database is loaded, so authorities can’t be verified. For the demo data run{" "}
          <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-xs text-bright">npm run legal:seed</code> and restart the server.
        </p>
      ) : null}

      {legal.relevance === "none" ? (
        <div className="mt-5 rounded-lg border border-dashed border-line-strong bg-canvas p-6 text-center text-sm text-muted">
          <IconBook className="mx-auto mb-2 h-6 w-6" />
          No legal authorities detected. This reads as a non-legal paper, so the legal check doesn’t apply.
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap gap-1.5">
            <Chip>{counts.verified} verified</Chip>
            <Chip tone="accent">{counts.goodLaw} good law</Chip>
            {counts.questionable > 0 ? <Chip tone="warn">{counts.questionable} questionable</Chip> : null}
            {counts.overruled > 0 ? <Chip tone="danger">{counts.overruled} overruled</Chip> : null}
            {counts.superseded > 0 ? <Chip tone="danger">{counts.superseded} superseded</Chip> : null}
            {counts.unverified > 0 ? <Chip>{counts.unverified} unverified</Chip> : null}
          </div>

          {legal.authorities.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {legal.authorities.map((authority) => (
                <li key={authority.docId} className="rounded-lg border border-line bg-canvas p-3.5">
                  <div className="flex items-start gap-2.5">
                    <VerdictBadge verdict={authority.verdict} />
                    <span className="min-w-0 flex-1 text-sm font-medium leading-5 text-bright">{authority.title}</span>
                  </div>
                  <p className="mt-1.5 font-mono text-[11px] text-muted">
                    {authority.docType} · {authority.jurisdiction}
                    {authority.court ? ` · ${authority.court}` : ""} · cited {authority.mentions}× · {authority.citingCount} later citing
                  </p>
                  <p className="mt-2 text-sm text-ink">{authority.reasons.join(" ")}</p>
                  {authority.statusMismatch ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-warn">
                      <IconAlert className="h-3.5 w-3.5" /> Database status “{authority.storedStatus.replace("_", " ")}” disagrees with the rule verdict.
                    </p>
                  ) : null}
                  <blockquote className="mt-2.5 border-l border-line-strong pl-2.5 text-xs italic leading-relaxed text-muted">…{authority.snippet}…</blockquote>
                </li>
              ))}
            </ul>
          ) : null}

          {legal.unverified.length > 0 ? (
            <div className="mt-6 space-y-2">
              <Divider title="Could not be verified" />
              <p className="text-xs text-muted">Not found in the connected database. This means unchecked, not wrong.</p>
              <ul className="flex flex-wrap gap-1.5">
                {legal.unverified.map((citation) => (
                  <li key={citation.text}>
                    <Chip>{citation.text}</Chip>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {legal.jurisdictions.length > 0 ? (
            <p className="mt-5 text-xs text-muted">Jurisdictions mentioned: {legal.jurisdictions.map((j) => `${j.name} (${j.mentions})`).join(", ")}</p>
          ) : null}
        </>
      )}
    </Card>
  );
}

function CheckRow({ label, ok, muted }: { label: string; ok: boolean; muted?: boolean }) {
  return (
    <li className={`flex items-center gap-2.5 text-sm ${muted ? "text-muted" : "text-ink"}`}>
      <span
        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
          muted ? "border-line-strong text-muted" : ok ? "border-accent-deep bg-accent/15 text-accent" : "border-danger/40 bg-danger/10 text-danger"
        }`}
      >
        {ok ? <IconCheck className="h-2.5 w-2.5" strokeWidth={3.5} /> : <IconX className="h-2.5 w-2.5" strokeWidth={3.5} />}
      </span>
      {label}
    </li>
  );
}

export function StructurePanel({ result }: { result: AnalysisResult }) {
  const { structure } = result;
  const refs = structure.references;
  return (
    <Card className="animate-rise p-5 sm:p-6" aria-label="Structure and references">
      <SectionTitle icon={<IconBook />} title="Structure and references" hint={`${result.completenessScore}% of expected sections and statements present`} />
      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className={`mb-3 ${EYEBROW}`}>Sections</h3>
          <ul className="space-y-2">
            {structure.sections.map((section) => (
              <CheckRow key={section.key} label={section.label} ok={section.found} />
            ))}
          </ul>
        </div>
        <div>
          <h3 className={`mb-3 ${EYEBROW}`}>Statements</h3>
          <ul className="space-y-2">
            {structure.statements.map((statement) => (
              <CheckRow
                key={statement.key}
                label={statement.applicable ? statement.label : `${statement.label} (not needed)`}
                ok={statement.found || !statement.applicable}
                muted={!statement.applicable}
              />
            ))}
          </ul>
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        {[
          ["References", refs.found ? String(refs.count) : "none"],
          ["In-text citations", String(refs.citationMarkers)],
          ["Figures / tables", `${structure.figures} / ${structure.tables}`],
          ["Reference years", refs.yearRange ? `${refs.yearRange[0]}–${refs.yearRange[1]}` : "n/a"],
        ].map(([label, value]) => (
          <div key={label} className="bg-canvas p-3">
            <dt className="text-[11px] text-muted">{label}</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-bright">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

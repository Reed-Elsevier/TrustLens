import type { AnalysisResult } from "@/lib/analyze/types";
import { Bar, Card, Chip, IconAlert, IconBook, IconCheck, IconScale, IconShield, IconX, SectionTitle, VerdictBadge } from "@/components/analyzer/ui";

const pct = (value: number) => `${Math.round(value * 100)}%`;

export function IntegrityPanel({ result }: { result: AnalysisResult }) {
  const { integrity } = result;
  return (
    <Card className="animate-rise p-5 sm:p-6" aria-label="Publishing integrity">
      <SectionTitle icon={<IconShield />} title="Publishing integrity" hint={`${integrity.score} of 100 risk points · indicators, not proof of misconduct`} />
      <ul className="mt-5 space-y-4">
        {integrity.signals.map((signal) => (
          <li key={signal.key}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{signal.label}</span>
              <span className="tabular-nums text-slate-500 dark:text-slate-400">{signal.applicable ? `${signal.points} / ${signal.maxPoints}` : "n/a"}</span>
            </div>
            <div className="mt-1.5">
              <Bar
                value={signal.points}
                max={signal.maxPoints}
                className={signal.points === 0 ? "bg-emerald-500" : signal.points / signal.maxPoints >= 0.5 ? "bg-rose-500" : "bg-amber-500"}
              />
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{signal.evidence}</p>
          </li>
        ))}
      </ul>

      <div className="mt-6 border-t border-slate-100 pt-5 dark:border-white/5">
        <h3 className="text-sm font-semibold">Closest published papers</h3>
        {integrity.matches.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {integrity.corpusSize === 0
              ? "No published abstracts are available to compare against."
              : `Compared ${integrity.comparedAgainst === "abstract" ? "the abstract" : "the opening text"} with ${integrity.corpusSize} published abstracts: no overlap found.`}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {integrity.matches.map((match) => (
              <li key={match.paperId} className="rounded-xl border border-slate-200 bg-white/60 p-3 text-sm dark:border-white/10 dark:bg-white/5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{match.title ?? match.paperId}</span>
                  <Chip>{match.paperId}</Chip>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-slate-500"><span>Topic similarity</span><span className="tabular-nums">{pct(match.cosine)}</span></div>
                    <Bar value={match.cosine} max={1} className="bg-indigo-500" />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-slate-500"><span>Phrases shared</span><span className="tabular-nums">{pct(match.containment)}</span></div>
                    <Bar value={match.containment} max={1} className="bg-fuchsia-500" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {integrity.anomalies.length > 0 ? (
        <div className="mt-6 border-t border-slate-100 pt-5 dark:border-white/5">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><IconAlert className="h-4 w-4 text-amber-500" /> Red flags in the text</h3>
          <ul className="mt-3 space-y-2">
            {integrity.anomalies.map((anomaly) => (
              <li key={anomaly.kind} className="rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-500/10">
                <p className="font-medium">{anomaly.label} <span className="font-normal text-slate-500">× {anomaly.count}</span></p>
                <p className="mt-1 text-xs italic text-slate-600 dark:text-slate-300">“{anomaly.example}”</p>
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
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          No legal database is loaded, so authorities can’t be verified. For the demo data run <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-xs dark:bg-white/10">npm run legal:seed</code> and restart the server.
        </p>
      ) : null}

      {legal.relevance === "none" ? (
        <div className="mt-5 rounded-xl bg-slate-100 p-5 text-center text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
          <IconBook className="mx-auto mb-2 h-7 w-7 text-slate-400" />
          No legal authorities detected. This reads as a non-legal paper, so the legal check doesn’t apply.
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap gap-2">
            <Chip tone="indigo">{counts.verified} verified</Chip>
            <Chip tone="emerald">{counts.goodLaw} good law</Chip>
            {counts.questionable > 0 ? <Chip tone="amber">{counts.questionable} questionable</Chip> : null}
            {counts.overruled > 0 ? <Chip tone="rose">{counts.overruled} overruled</Chip> : null}
            {counts.superseded > 0 ? <Chip tone="rose">{counts.superseded} superseded</Chip> : null}
            {counts.unverified > 0 ? <Chip>{counts.unverified} unverified</Chip> : null}
          </div>

          {legal.authorities.length > 0 ? (
            <ul className="mt-5 space-y-3">
              {legal.authorities.map((authority) => (
                <li key={authority.docId} className="rounded-xl border border-slate-200 bg-white/60 p-3.5 dark:border-white/10 dark:bg-white/5">
                  <div className="flex flex-wrap items-center gap-2">
                    <VerdictBadge verdict={authority.verdict} />
                    <span className="min-w-0 flex-1 text-sm font-semibold">{authority.title}</span>
                    <Chip>{authority.docType}</Chip>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {authority.jurisdiction}{authority.court ? ` · ${authority.court}` : ""} · cited {authority.mentions}× · {authority.citingCount} later citing document(s)
                  </p>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{authority.reasons.join(" ")}</p>
                  {authority.statusMismatch ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                      <IconAlert className="h-3.5 w-3.5" /> Database status “{authority.storedStatus.replace("_", " ")}” disagrees with the rule verdict.
                    </p>
                  ) : null}
                  <blockquote className="mt-2 border-l-2 border-indigo-300 pl-3 text-xs italic text-slate-500 dark:text-slate-400">…{authority.snippet}…</blockquote>
                </li>
              ))}
            </ul>
          ) : null}

          {legal.unverified.length > 0 ? (
            <div className="mt-5">
              <h3 className="text-sm font-semibold">Could not be verified</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Not found in the connected database. This means “unchecked”, not “wrong”.</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {legal.unverified.map((citation) => <li key={citation.text}><Chip>{citation.text}</Chip></li>)}
              </ul>
            </div>
          ) : null}

          {legal.jurisdictions.length > 0 ? (
            <p className="mt-5 text-xs text-slate-500 dark:text-slate-400">
              Jurisdictions mentioned: {legal.jurisdictions.map((j) => `${j.name} (${j.mentions})`).join(", ")}
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}

function CheckRow({ label, ok, muted }: { label: string; ok: boolean; muted?: boolean }) {
  return (
    <li className={`flex items-center gap-2 text-sm ${muted ? "opacity-50" : ""}`}>
      <span className={`grid h-5 w-5 place-items-center rounded-full text-white ${ok ? "bg-emerald-500" : "bg-rose-400"}`}>
        {ok ? <IconCheck className="h-3 w-3" strokeWidth={3} /> : <IconX className="h-3 w-3" strokeWidth={3} />}
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
      <SectionTitle icon={<IconBook />} title="Structure & references" hint={`${result.completenessScore}% of expected sections and statements present`} />
      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sections</h3>
          <ul className="space-y-2">{structure.sections.map((section) => <CheckRow key={section.key} label={section.label} ok={section.found} />)}</ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Statements</h3>
          <ul className="space-y-2">
            {structure.statements.map((statement) => (
              <CheckRow key={statement.key} label={statement.applicable ? statement.label : `${statement.label} (not needed)`} ok={statement.found || !statement.applicable} muted={!statement.applicable} />
            ))}
          </ul>
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 text-center sm:grid-cols-4 dark:border-white/5">
        {[
          ["References", refs.found ? String(refs.count) : "none"],
          ["In-text citations", String(refs.citationMarkers)],
          ["Figures / tables", `${structure.figures} / ${structure.tables}`],
          ["Reference years", refs.yearRange ? `${refs.yearRange[0]}–${refs.yearRange[1]}` : "n/a"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-100/80 p-3 dark:bg-white/5">
            <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

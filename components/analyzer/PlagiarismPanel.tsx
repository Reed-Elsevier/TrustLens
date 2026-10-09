import type { AnalysisResult } from "@/lib/analyze/types";
import { EYEBROW } from "@/components/analyzer/ui";

export function PlagiarismPanel({ result }: { result: AnalysisResult }) {
  const report = result.plagiarism;
  return (
    <section aria-label="Plagiarism checker" className="rounded-xl border border-line bg-panel p-5">
      <p className={EYEBROW}>Plagiarism checker</p>
      <h2 className="mt-2 text-lg font-semibold text-bright">
        {report.available ? `${report.overlapPercent}% detected text overlap` : "Screening unavailable"}
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-muted">{report.notice}</p>
      {report.available ? <p className="mt-3 text-sm text-ink">{report.matchedWords.toLocaleString()} of {report.checkedWords.toLocaleString()} checked words overlap. {report.matchCount} matching passage(s).</p> : null}
      <div className="mt-4 space-y-3">
        {report.matches.map((match, index) => (
          <details key={`${match.paperId}:${match.startWord}:${index}`} className="rounded-lg border border-line bg-canvas p-3">
            <summary className="cursor-pointer text-sm text-bright">{match.title ?? match.paperId} · {match.sharedWords} shared words</summary>
            <p className="mt-2 font-mono text-xs text-muted">Source: {match.paperId}{match.doi ? ` · DOI: ${match.doi}` : ""} · Body words {match.startWord}-{match.endWord}</p>
            <p className="mt-3 text-xs font-semibold text-muted">Your manuscript (excerpt)</p>
            <blockquote className="mt-1 text-sm text-ink">{match.passage}</blockquote>
            <p className="mt-3 text-xs font-semibold text-muted">Published abstract (excerpt)</p>
            <blockquote className="mt-1 text-sm text-ink">{match.sourcePassage}</blockquote>
          </details>
        ))}
      </div>
      {report.matchCount > report.matches.length ? <p className="mt-3 text-xs text-muted">Showing the {report.matches.length} longest matches of {report.matchCount}. The percentage includes all matches, counting each manuscript word once.</p> : null}
    </section>
  );
}

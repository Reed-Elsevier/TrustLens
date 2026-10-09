import { SIMILARITY_CONFIG } from "@/lib/analyze/config";
import type { Finding, IntegrityReport, LegalReport, Severity, StructureReport } from "@/lib/analyze/types";

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

const SECTION_SEVERITY: Record<string, Severity> = { abstract: "medium", introduction: "low", methods: "medium", results: "medium", discussion: "low", conclusion: "medium" };
const STATEMENT_SEVERITY: Record<string, Severity> = { conflict: "medium", dataAvailability: "medium", funding: "low", ethics: "high", contributions: "low" };
const STATEMENT_FIX: Record<string, string> = {
  conflict: "Add a conflict-of-interest statement, even if it is “the authors declare no competing interests”.",
  dataAvailability: "State where the data, code or materials can be accessed, or why they cannot be shared.",
  funding: "Add a funding statement naming grants and sponsors, or state that there was no external funding.",
  ethics: "Report the ethics approval body, reference number and how informed consent was obtained.",
  contributions: "Add an author-contributions statement (for example using the CRediT taxonomy).",
};

/** Every deterministic gap. Each carries a stable id so AI text can reference, but never invent, findings. */
export function buildFindings(input: { structure: StructureReport; integrity: IntegrityReport; legal: LegalReport }): Finding[] {
  const { structure, integrity, legal } = input;
  const findings: Finding[] = [];
  const add = (finding: Finding) => findings.push(finding);

  const top = integrity.matches[0];
  if (top && Math.max(top.cosine, top.containment) >= SIMILARITY_CONFIG.flagCosine) {
    const strength = Math.max(top.cosine, top.containment);
    add({
      id: "integrity.similarity",
      area: "integrity",
      severity: strength >= SIMILARITY_CONFIG.highCosine ? "high" : "medium",
      title: "Abstract closely resembles a published paper",
      detail: `Closest match ${top.paperId}${top.title ? ` (“${top.title}”)` : ""}: cosine ${top.cosine.toFixed(2)}, ${Math.round(top.containment * 100)}% of phrases shared.`,
      fix: "Compare both texts side by side and ask the authors to explain or cite the overlap.",
    });
  }

  for (const anomaly of integrity.anomalies) {
    if (anomaly.kind === "reviewer_manipulation") {
      add({ id: "integrity.manipulation", area: "integrity", severity: "high", title: "Text aimed at reviewers or AI tools", detail: `${anomaly.count} occurrence(s), e.g. “${anomaly.example}”.`, fix: "Escalate to the editor; instructions to reviewers or AI tools should never appear in a manuscript." });
    } else if (anomaly.kind === "llm_artifact") {
      add({ id: "integrity.llm_artifact", area: "integrity", severity: "medium", title: "Chatbot output left in the text", detail: `${anomaly.count} occurrence(s), e.g. “${anomaly.example}”.`, fix: "Ask the authors to disclose AI assistance and remove the leftover text." });
    } else if (anomaly.kind === "tortured_phrase") {
      add({ id: "integrity.tortured_phrase", area: "integrity", severity: anomaly.count >= 3 ? "high" : "medium", title: "Tortured phrases found", detail: `${anomaly.count} machine-paraphrased term(s), e.g. “${anomaly.example}”.`, fix: "Check the affected passages for automated paraphrasing; request the original wording." });
    } else if (anomaly.kind === "placeholder") {
      add({ id: "integrity.placeholder", area: "integrity", severity: "low", title: "Unfinished placeholder text", detail: `${anomaly.count} placeholder(s), e.g. “${anomaly.example}”.`, fix: "Replace placeholders with final content before submission." });
    } else {
      add({ id: "integrity.duplicate_text", area: "integrity", severity: anomaly.count >= 3 ? "medium" : "low", title: "Sentences repeated verbatim", detail: `${anomaly.count} repeated sentence(s), e.g. “${anomaly.example}”.`, fix: "Remove duplicated passages or confirm they are intentional quotations." });
    }
  }

  for (const statement of structure.statements) {
    if (statement.applicable && !statement.found) {
      add({ id: `structure.statement.${statement.key}`, area: "structure", severity: STATEMENT_SEVERITY[statement.key] ?? "low", title: `Missing: ${statement.label.toLowerCase()}`, detail: `No ${statement.label.toLowerCase()} was detected in the text.`, fix: STATEMENT_FIX[statement.key] ?? "Add the missing statement." });
    }
  }
  for (const section of structure.sections) {
    if (!section.found && section.key !== "references") {
      add({ id: `structure.section.${section.key}`, area: "structure", severity: SECTION_SEVERITY[section.key] ?? "low", title: `No ${section.label.toLowerCase()} section found`, detail: `A heading for “${section.label}” was not detected.`, fix: `Add a clearly labelled ${section.label.toLowerCase()} section, or explain why it does not apply.` });
    }
  }

  const refs = structure.references;
  if (!refs.found) {
    add({ id: "references.missing", area: "references", severity: "high", title: "No reference list found", detail: "No References or Bibliography heading was detected.", fix: "Add a complete reference list covering every in-text citation." });
  } else {
    if (refs.count < 10) add({ id: "references.few", area: "references", severity: refs.count < 5 ? "high" : "medium", title: "Thin reference list", detail: `Only ${refs.count} reference(s) detected.`, fix: "Situate the work in the literature with additional relevant, recent sources." });
    if (refs.maxNumericMarker !== null && refs.maxNumericMarker > refs.count) add({ id: "references.mismatch", area: "references", severity: "medium", title: "In-text citations exceed the reference list", detail: `Citation [${refs.maxNumericMarker}] appears but only ${refs.count} references were detected.`, fix: "Reconcile numbered citations with the reference list." });
    if (refs.olderShare !== null && refs.olderShare > 0.7) add({ id: "references.dated", area: "references", severity: "low", title: "Mostly older references", detail: `${Math.round(refs.olderShare * 100)}% of dated references are more than 15 years old.`, fix: "Add recent work so the paper reflects current scholarship." });
    if (refs.duplicates > 0) add({ id: "references.duplicates", area: "references", severity: "low", title: "Duplicated references", detail: `${refs.duplicates} duplicated reference line(s).`, fix: "Remove duplicate entries." });
  }

  for (const authority of legal.authorities) {
    const mismatch = authority.statusMismatch ? ` The database status “${authority.storedStatus}” disagrees with the rule verdict.` : "";
    if (authority.verdict === "overruled") add({ id: `legal.overruled.${authority.docId}`, area: "legal", severity: "high", title: `Cites an overruled authority: ${authority.title}`, detail: `${authority.reasons.join(" ")}${mismatch}`, fix: `Remove or qualify “${authority.title}” and cite the decision that overruled it.` });
    else if (authority.verdict === "superseded") add({ id: `legal.superseded.${authority.docId}`, area: "legal", severity: "high", title: `Cites a superseded instrument: ${authority.title}`, detail: `${authority.reasons.join(" ")}${mismatch}`, fix: `Cite the current instrument that repealed or replaced “${authority.title}”.` });
    else if (authority.verdict === "questionable") add({ id: `legal.questionable.${authority.docId}`, area: "legal", severity: "medium", title: `Authority under criticism: ${authority.title}`, detail: authority.reasons.join(" "), fix: `Discuss the later criticism of “${authority.title}” and justify continued reliance on it.` });
  }
  if (legal.unverified.length > 0) {
    add({ id: "legal.unverified", area: "legal", severity: legal.unverified.length >= 3 ? "medium" : "low", title: `${legal.unverified.length} legal citation(s) could not be verified`, detail: `Not found in the connected legal database: ${legal.unverified.slice(0, 4).map((u) => u.text).join("; ")}${legal.unverified.length > 4 ? "; …" : ""}.`, fix: "Provide full citations (court, year, reporter) so each authority can be checked for current status." });
  }
  if (!legal.available && legal.relevance !== "none") {
    add({ id: "legal.unavailable", area: "legal", severity: "low", title: "Legal reference data is not loaded", detail: "The paper reads as legal research but no legal database is connected, so authorities could not be checked.", fix: "Load the legal dataset (for the demo: npm run legal:seed) and re-run the analysis." });
  }
  if (legal.available && legal.relevance === "high" && legal.counts.verified + legal.counts.unverified === 0) {
    add({ id: "legal.no_authorities", area: "legal", severity: "medium", title: "Legal argument without identifiable authorities", detail: `${legal.legalTermCount} legal terms found but no case or statute citations could be identified.`, fix: "Support legal claims with specific cases, statutes or regulations." });
  }

  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.area.localeCompare(b.area) || a.id.localeCompare(b.id));
}

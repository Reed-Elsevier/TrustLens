#!/usr/bin/env node
/**
 * Writes public/sample-paper.pdf: an invented demo paper that cites authorities from the deterministic
 * legal seed (seed 42) and contains deliberate gaps, so every part of the analyzer has something to show.
 * It builds the legal data in memory only; no database file is touched.
 *
 * Usage: node scripts/fixtures/make-sample-paper.mjs
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { generateLegal } from "./generate-legal.mjs";
import { buildPdf } from "./pdf-builder.mjs";

const OUTPUT = fileURLToPath(new URL("../../public/sample-paper.pdf", import.meta.url));

const memory = new Database(":memory:");
const { truth } = generateLegal(memory);
const title = (id) => memory.prepare("SELECT title FROM legal_documents WHERE doc_id = ?").get(id).title;
const planted = new Set([...truth.overruledIds, ...truth.questionableIds, ...truth.supersededIds]);
const goodLaw = memory
  .prepare(`SELECT d.doc_id FROM legal_documents d JOIN legal_citations c ON c.cited_doc_id = d.doc_id
    WHERE d.doc_type = 'case' AND d.doc_id NOT IN (${[...planted].map(() => "?").join(",")})
    GROUP BY d.doc_id HAVING COUNT(*) >= 3 ORDER BY d.doc_id LIMIT 1`)
  .get(...planted).doc_id;
const supersededStatute = truth.supersededIds.find((id) => memory.prepare("SELECT doc_type FROM legal_documents WHERE doc_id = ?").get(id).doc_type === "statute");
const supersededRegulation = truth.supersededIds.find((id) => memory.prepare("SELECT doc_type FROM legal_documents WHERE doc_id = ?").get(id).doc_type === "regulation");
const authorities = {
  overruled: title(truth.overruledIds[0]),
  questionable: title(truth.questionableIds[0]),
  goodLaw: title(goodLaw),
  statute: title(supersededStatute),
  regulation: title(supersededRegulation),
};
memory.close();

const paper = `Notice Standards in Public Records Disclosure: A Cross-Jurisdictional Review (SAMPLE, synthetic demo paper)

Abstract
This paper examines how courts and legislatures in several invented jurisdictions have treated the duty to give notice before public records are disclosed. We combine a doctrinal review of leading decisions with a survey of 40 records officers about how notice duties work in daily practice. We find that notice standards are applied inconsistently, that older authorities are still cited after later decisions limited them, and that digital notice systems, including counterfeit consciousness tools used to classify requests, are adopted faster than the law can adapt.

Keywords: records disclosure, notice, administrative law

1. Introduction
Public bodies must give affected persons notice before releasing records. The leading authority is ${authorities.overruled}, which held that a single posted notice was enough. Later courts have questioned that approach, and the reasoning in ${authorities.questionable} has been described as unclear on what counts as adequate delivery. By contrast, ${authorities.goodLaw} remains widely followed on the requirement of timely service. Another case, Fairbanks v. Quillon Group, is often cited for the proposition that electronic notice is sufficient. Statutory duties are set by the ${authorities.statute}, read with the ${authorities.regulation}. The Records Disclosure Act 2011 is also relevant to the discussion that follows [1][2][9].

2. Methods
We reviewed reported decisions and statutes in three jurisdictions and surveyed 40 records officers about their notice practices. Survey responses were coded by one researcher. Participants were recruited through professional networks.

3. Results
Table 1 summarises the survey. Most respondents (31 of 40) said notice is usually given by electronic message, while 9 relied on posted notices. Figure 1 shows the spread of reported delivery times, which ranged from same-day to more than two weeks [3][4].

4. Discussion
The doctrinal review suggests that adequacy of notice depends heavily on the forum. Where a statute is silent, courts fall back on general fairness standards. Our survey results are consistent with that reading, although the sample is small and drawn from professional networks.

5. Conclusion
Notice duties for records disclosure are unsettled. Legislatures should set clear delivery standards, and courts should state plainly which earlier authorities they no longer follow.

References
[1] Aldrin, P. (1998). Records and the public interest. Journal of Administrative Practice, 12(3), 44-61.
[2] Becker, L. (2003). Notice in administrative law. Civic Law Review, 8(1), 1-29.
[3] Cortez, M. (2011). Electronic service of process. Technology and Law, 4(2), 100-119.
[4] Dalgaard, H. (2006). Fairness in disclosure. Public Law Quarterly, 19(4), 301-322.
[5] Eklund, S. (1999). Posting and publication. Journal of Administrative Practice, 13(1), 5-22.
[6] Farouk, N. (2008). Delivery delay in notice systems. Civic Law Review, 13(2), 77-98.
`;

fs.mkdirSync(fileURLToPath(new URL("../../public/", import.meta.url)), { recursive: true });
fs.writeFileSync(OUTPUT, buildPdf(paper, { title: "Notice Standards in Public Records Disclosure (SAMPLE)" }));
console.log(`Wrote ${OUTPUT}`);
console.log("Authorities embedded:", authorities);

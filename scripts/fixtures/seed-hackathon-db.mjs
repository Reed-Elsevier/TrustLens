#!/usr/bin/env node
/**
 * Creates data/test-fixture.db, matching the
 * schema documented in docs/SPEC-publishing.md section 4. This is a stand-in
 * for the real hackathon dataset so the Publishing Integrity feature can be
 * exercised end-to-end without it.
 *
 * Deliberately includes a handful of hand-picked scenarios so every risk
 * signal and the ring-detection logic has at least one manuscript to fire on:
 *   - MS00000001 / MS00000002: a reciprocal reviewer-ring pair (A0000001 <-> A0000002)
 *   - MS00000003: very high text similarity
 *   - MS00000004: fast-track acceptance (short turnaround, low revision rounds)
 *   - MS00000005: editor concentration (same handling editor across several of one author's manuscripts)
 *   - MS00000006-MS00000015: ordinary/low-risk manuscripts to give the percentile
 *     thresholds (p75/p95/p10) a realistic enough spread to compute against
 *
 * Usage: node scripts/fixtures/seed-hackathon-db.mjs
 */
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { assertSafeFixtureTarget } from "./fixture-db.mjs";

if (process.argv.length > 2) throw new Error("Fixture scripts do not accept a target override.");
const DB_PATH = assertSafeFixtureTarget();
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

if (fs.existsSync(DB_PATH)) {
  fs.rmSync(DB_PATH);
}

const db = new Database(DB_PATH);

db.exec(`
CREATE TABLE institutions (
  institution_id TEXT PRIMARY KEY,
  institution_name TEXT,
  institution_type TEXT,
  country TEXT,
  research_tier TEXT
);

CREATE TABLE authors (
  author_id TEXT PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  author_ref_id TEXT,
  country TEXT,
  primary_institution_id TEXT,
  h_index REAL,
  first_publication_year REAL,
  is_reviewer TEXT
);

CREATE TABLE manuscripts (
  manuscript_id TEXT PRIMARY KEY,
  journal_id TEXT,
  corresponding_author_id TEXT,
  handling_editor_author_id TEXT,
  ops_coordinator_employee_id TEXT,
  article_type TEXT,
  subject_area TEXT,
  topic TEXT,
  submitted_at TEXT,
  first_decision_at TEXT,
  final_decision_at TEXT,
  final_decision TEXT,
  revision_rounds REAL,
  turnaround_days REAL,
  similarity_score_pct REAL
);

CREATE TABLE peer_review_assignments (
  assignment_id TEXT PRIMARY KEY,
  manuscript_id TEXT,
  reviewer_author_id TEXT,
  invited_at TEXT,
  responded_at TEXT,
  response TEXT,
  due_at TEXT,
  review_submitted_at TEXT,
  is_overdue TEXT,
  recommendation TEXT,
  review_quality_score REAL,
  review_word_count REAL
);

CREATE TABLE research_papers_published (
  paper_id TEXT PRIMARY KEY,
  manuscript_id TEXT,
  journal_id TEXT,
  published_date TEXT,
  doi TEXT,
  title TEXT,
  abstract TEXT,
  keywords TEXT,
  subject_area TEXT,
  topic TEXT,
  article_type TEXT,
  open_access TEXT,
  page_count REAL,
  downloads_total REAL,
  citation_count REAL,
  institution_id TEXT
);

CREATE TABLE research_integrity_flags (
  flag_id TEXT PRIMARY KEY,
  paper_id TEXT,
  flag_type TEXT,
  manuscript_id TEXT,
  flagged_at TEXT,
  detected_by TEXT,
  status TEXT,
  assigned_employee_id TEXT,
  evidence_summary TEXT
);

CREATE TABLE citations (
  citation_id TEXT PRIMARY KEY,
  citing_paper_id TEXT,
  cited_paper_id TEXT,
  citation_year REAL,
  context_section TEXT
);
`);

const institutions = [
  ["I1", "Alpha University", "Academic", "US", "R1"],
  ["I2", "Beta Institute", "Academic", "UK", "R2"],
  ["I3", "Gamma College", "Academic", "DE", "R2"],
  ["I4", "Delta Labs", "Industry", "JP", "R3"],
  ["I5", "Epsilon State University", "Academic", "CA", "R1"],
];
const insInst = db.prepare("INSERT INTO institutions VALUES (?,?,?,?,?)");
for (const row of institutions) insInst.run(...row);

// 12 authors: A0000001..A0000012
const authorNames = [
  ["Alice", "Smith"], ["Bob", "Jones"], ["Carol", "Diaz"], ["Dave", "Kim"],
  ["Eve", "Nguyen"], ["Frank", "Muller"], ["Grace", "Chen"], ["Heidi", "Patel"],
  ["Ivan", "Rossi"], ["Judy", "Lopez"], ["Karl", "Schmidt"], ["Lena", "Petrov"],
];
const countries = ["US", "UK", "DE", "JP", "CA"];
const insAuthor = db.prepare("INSERT INTO authors VALUES (?,?,?,?,?,?,?,?,?,?)");
for (let i = 0; i < authorNames.length; i++) {
  const id = `A${String(i + 1).padStart(7, "0")}`;
  const [first, last] = authorNames[i];
  const institutionId = `I${(i % institutions.length) + 1}`;
  const country = countries[i % countries.length];
  insAuthor.run(id, first, last, `${first} ${last}`, `REF-${id}`, country, institutionId, 10 + i * 2, 2010 + (i % 10), i % 3 === 0 ? "FALSE" : "TRUE");
}

const insMs = db.prepare(`INSERT INTO manuscripts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insReview = db.prepare(`INSERT INTO peer_review_assignments VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
const insPaper = db.prepare(`INSERT INTO research_papers_published VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insFlag = db.prepare(`INSERT INTO research_integrity_flags VALUES (?,?,?,?,?,?,?,?,?)`);
const insCitation = db.prepare(`INSERT INTO citations VALUES (?,?,?,?,?)`);

const subjectAreas = [
  ["Biology", "Genomics"],
  ["Chemistry", "Catalysis"],
  ["Physics", "Optics"],
  ["Computer Science", "Machine Learning"],
];

function reviewRow(assignmentId, manuscriptId, reviewerId, invitedAt, reviewDays, response, recommendation, qualityScore, wordCount) {
  const invited = new Date(invitedAt);
  const due = new Date(invited.getTime() + 21 * 86400000);
  const submitted = response === "Declined" ? null : new Date(invited.getTime() + reviewDays * 86400000);
  insReview.run(
    assignmentId,
    manuscriptId,
    reviewerId,
    iso(invited),
    response === "Declined" ? iso(invited) : iso(invited),
    response,
    iso(due),
    submitted ? iso(submitted) : null,
    submitted && submitted > due ? "TRUE" : "FALSE",
    submitted ? recommendation : null,
    submitted ? qualityScore : null,
    submitted ? wordCount : null
  );
}

function iso(d) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function addManuscript({
  manuscriptId,
  journalId = "J1",
  correspondingAuthorId,
  handlingEditorId,
  subjectArea,
  topic,
  submittedAt,
  turnaroundDays,
  revisionRounds,
  finalDecision,
  similarityScorePct,
  reviews,
  publish,
  flag,
}) {
  const submitted = new Date(submittedAt);
  const finalDecisionAt = new Date(submitted.getTime() + turnaroundDays * 86400000);
  const firstDecisionAt = new Date(submitted.getTime() + Math.max(1, turnaroundDays - 5) * 86400000);
  insMs.run(
    manuscriptId,
    journalId,
    correspondingAuthorId,
    handlingEditorId,
    "EMP001",
    "Research",
    subjectArea,
    topic,
    iso(submitted),
    iso(firstDecisionAt),
    iso(finalDecisionAt),
    finalDecision,
    revisionRounds,
    turnaroundDays,
    similarityScorePct
  );

  reviews.forEach((r, idx) => {
    reviewRow(
      `${manuscriptId}-R${idx + 1}`,
      manuscriptId,
      r.reviewerId,
      submittedAt,
      r.reviewDays,
      r.response ?? "Accepted",
      r.recommendation,
      r.qualityScore,
      r.wordCount
    );
  });

  if (publish) {
    const paperId = `P-${manuscriptId}`;
    insPaper.run(
      paperId,
      manuscriptId,
      journalId,
      iso(finalDecisionAt),
      `10.1000/${manuscriptId}`,
      `Study of ${topic} findings ${manuscriptId}`,
      `Abstract for ${manuscriptId}.`,
      topic,
      subjectArea,
      topic,
      "Research",
      "TRUE",
      12,
      500,
      publish.citationCount ?? 2,
      "I1"
    );
    if (publish.citationCount) {
      for (let c = 0; c < publish.citationCount; c++) {
        insCitation.run(`C-${manuscriptId}-${c}`, `P-OTHER-${c}`, paperId, 2024, "introduction");
      }
    }
  }

  if (flag) {
    insFlag.run(
      `F-${manuscriptId}`,
      publish ? `P-${manuscriptId}` : null,
      flag.flagType,
      manuscriptId,
      iso(finalDecisionAt),
      flag.detectedBy ?? "automated",
      flag.status ?? "open",
      "EMP002",
      flag.evidenceSummary ?? "Evidence summary text."
    );
  }
}

// 1-2: reciprocal reviewer ring (A0000001 reviews A0000002's manuscript and vice versa)
addManuscript({
  manuscriptId: "MS00000001",
  correspondingAuthorId: "A0000002",
  handlingEditorId: "A0000004",
  subjectArea: "Biology",
  topic: "Genomics",
  submittedAt: "2023-01-01 00:00:00",
  turnaroundDays: 25,
  revisionRounds: 1,
  finalDecision: "Accepted",
  similarityScorePct: 18,
  reviews: [
    { reviewerId: "A0000001", reviewDays: 4, recommendation: "Accept", qualityScore: 3, wordCount: 160 },
    { reviewerId: "A0000003", reviewDays: 16, recommendation: "Minor Revision", qualityScore: 8, wordCount: 900 },
  ],
  publish: { citationCount: 3 },
});
addManuscript({
  manuscriptId: "MS00000002",
  correspondingAuthorId: "A0000001",
  handlingEditorId: "A0000004",
  subjectArea: "Biology",
  topic: "Genomics",
  submittedAt: "2023-02-01 00:00:00",
  turnaroundDays: 28,
  revisionRounds: 1,
  finalDecision: "Accepted",
  similarityScorePct: 22,
  reviews: [
    { reviewerId: "A0000002", reviewDays: 3, recommendation: "Accept", qualityScore: 2, wordCount: 150 },
    { reviewerId: "A0000005", reviewDays: 14, recommendation: "Minor Revision", qualityScore: 7, wordCount: 800 },
  ],
  publish: { citationCount: 1 },
});

// 3: very high text similarity
addManuscript({
  manuscriptId: "MS00000003",
  correspondingAuthorId: "A0000006",
  handlingEditorId: "A0000007",
  subjectArea: "Chemistry",
  topic: "Catalysis",
  submittedAt: "2023-01-10 00:00:00",
  turnaroundDays: 30,
  revisionRounds: 1,
  finalDecision: "Accepted",
  similarityScorePct: 96,
  reviews: [
    { reviewerId: "A0000008", reviewDays: 15, recommendation: "Minor Revision", qualityScore: 6, wordCount: 700 },
    { reviewerId: "A0000009", reviewDays: 18, recommendation: "Major Revision", qualityScore: 5, wordCount: 650 },
  ],
  publish: { citationCount: 0 },
  flag: { flagType: "Plagiarism", status: "open", evidenceSummary: "High text-overlap with a prior publication." },
});

// 4: fast-track acceptance, 0 revision rounds, short turnaround
addManuscript({
  manuscriptId: "MS00000004",
  correspondingAuthorId: "A0000010",
  handlingEditorId: "A0000007",
  subjectArea: "Physics",
  topic: "Optics",
  submittedAt: "2023-03-01 00:00:00",
  turnaroundDays: 7,
  revisionRounds: 0,
  finalDecision: "Accepted",
  similarityScorePct: 12,
  reviews: [
    { reviewerId: "A0000011", reviewDays: 2, recommendation: "Accept", qualityScore: 3, wordCount: 120 },
    { reviewerId: "A0000012", reviewDays: 2, recommendation: "Accept", qualityScore: 2, wordCount: 110 },
  ],
  publish: { citationCount: 0 },
});

// 5-7: editor concentration -- same handling editor across 3 manuscripts from the same author
for (let i = 0; i < 3; i++) {
  addManuscript({
    manuscriptId: `MS0000000${5 + i}`,
    correspondingAuthorId: "A0000005",
    handlingEditorId: "A0000006",
    subjectArea: "Computer Science",
    topic: "Machine Learning",
    submittedAt: `2023-0${4 + i}-01 00:00:00`,
    turnaroundDays: 35 + i,
    revisionRounds: 2,
    finalDecision: "Accepted",
    similarityScorePct: 20 + i,
    reviews: [
      { reviewerId: "A0000007", reviewDays: 17 + i, recommendation: "Minor Revision", qualityScore: 7, wordCount: 850 },
      { reviewerId: "A0000008", reviewDays: 19 + i, recommendation: "Accept", qualityScore: 8, wordCount: 900 },
    ],
    publish: { citationCount: 1 },
  });
}

// 8-15: ordinary low-risk manuscripts for a realistic percentile spread
for (let i = 0; i < 8; i++) {
  const n = 8 + i;
  const [subjectArea, topic] = subjectAreas[i % subjectAreas.length];
  addManuscript({
    manuscriptId: `MS${String(n).padStart(8, "0")}`,
    correspondingAuthorId: `A${String(((i + 2) % 12) + 1).padStart(7, "0")}`,
    handlingEditorId: `A${String(((i + 5) % 12) + 1).padStart(7, "0")}`,
    subjectArea,
    topic,
    submittedAt: `2023-0${(i % 6) + 1}-15 00:00:00`,
    turnaroundDays: 32 + i * 2,
    revisionRounds: 1 + (i % 2),
    finalDecision: i % 5 === 0 ? "Rejected" : "Accepted",
    similarityScorePct: 15 + i * 3,
    reviews: [
      { reviewerId: `A${String(((i + 7) % 12) + 1).padStart(7, "0")}`, reviewDays: 12 + i, recommendation: "Minor Revision", qualityScore: 6, wordCount: 700 + i * 20 },
      { reviewerId: `A${String(((i + 9) % 12) + 1).padStart(7, "0")}`, reviewDays: 14 + i, recommendation: i % 4 === 0 ? "Reject" : "Accept", qualityScore: 5 + (i % 4), wordCount: 650 + i * 15 },
    ],
    publish: i % 5 !== 0 ? { citationCount: i % 4 } : undefined,
  });
}

const manuscriptCount = db.prepare("SELECT COUNT(*) AS c FROM manuscripts").get().c;
db.close();
console.log(`Created ${DB_PATH} with ${manuscriptCount} manuscripts.`);

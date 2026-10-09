import fs from "node:fs";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Use the existing TypeScript dependency, as publishing fixture loaders do;
// do not require Node's newer native .ts execution for seed commands.
const configPath = fileURLToPath(new URL("../../lib/legal/config.ts", import.meta.url));
const configModule = new Module(configPath);
configModule._compile(ts.transpileModule(fs.readFileSync(configPath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, configPath);
export const LEGAL_CONFIG = configModule.exports;
const {
  LEGAL_DOCUMENTS: D, LEGAL_CITATIONS: C, REGULATORY_UPDATES: U,
  REGULATORY_UPDATE_IMPACTS: I, EDITORIAL_TASKS: T,
  DEADLINE_HOURS, DOC_TYPES,
} = LEGAL_CONFIG;

const jurisdictions = ["Northmark", "Eastvale", "Tarvonia", "Sundale", "Brightmoor", "Calderon", "Halvern", "Wexmoor", "Pellham"];
const lateJurisdictions = ["Tarvonia", "Brightmoor", "Wexmoor"];
const hour = 3_600_000;
const stamp = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
const epoch = (date) => Date.parse(date.replace(" ", "T") + "Z");
const id = (prefix, n, width = 5) => prefix + String(n).padStart(width, "0");

function mulberry32(seed) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function generateLegal(db, { seed = 42 } = {}) {
  if (!Number.isInteger(seed)) throw new Error("seed must be an integer");
  if (db.readonly) throw new Error("generateLegal requires a writable database");
  return db.transaction(() => {
    const random = mulberry32(seed);
    const integer = (min, max) => min + Math.floor(random() * (max - min + 1));
    // DROP TABLE can cascade into unrelated tables when foreign keys are enabled.
    const legalNames = new Set([D.table, C.table, U.table, I.table, T.table]);
    const otherTables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().filter(({ name }) => !legalNames.has(name));
    for (const { name } of otherTables) {
      const identifier = `"${name.replaceAll('"', '""')}"`;
      if (db.prepare(`PRAGMA foreign_key_list(${identifier})`).all().some((row) => legalNames.has(row.table))) {
        throw new Error("Refusing to replace legal tables referenced by an unrelated table.");
      }
    }
    for (const table of [T, I, C, U, D]) db.exec(`DROP TABLE IF EXISTS ${table.table}`);
    db.exec(`
      CREATE TABLE ${D.table} (
        ${D.doc_id} TEXT PRIMARY KEY, ${D.doc_type} TEXT NOT NULL CHECK (${D.doc_type} IN ('case','statute','regulation')),
        ${D.title} TEXT NOT NULL, ${D.jurisdiction} TEXT NOT NULL, ${D.court} TEXT, ${D.court_level} INTEGER,
        ${D.decision_date} TEXT NOT NULL, ${D.status} TEXT NOT NULL CHECK (${D.status} IN ('good_law','overruled','superseded')),
        ${D.summary} TEXT NOT NULL, ${D.full_text} TEXT NOT NULL,
        CHECK ((${D.doc_type} = 'case' AND ${D.court} IS NOT NULL AND ${D.court_level} IN (1,2,3))
          OR (${D.doc_type} != 'case' AND ${D.court} IS NULL AND ${D.court_level} IS NULL))
      );
      CREATE TABLE ${C.table} (
        ${C.citation_id} TEXT PRIMARY KEY, ${C.citing_doc_id} TEXT NOT NULL REFERENCES ${D.table},
        ${C.cited_doc_id} TEXT NOT NULL REFERENCES ${D.table},
        ${C.treatment} TEXT NOT NULL CHECK (${C.treatment} IN ('follows','distinguishes','criticizes','overrules')),
        ${C.citation_date} TEXT NOT NULL, ${C.context_snippet} TEXT NOT NULL
      );
      CREATE TABLE ${U.table} (
        ${U.update_id} TEXT PRIMARY KEY, ${U.jurisdiction} TEXT NOT NULL,
        ${U.published_at} TEXT NOT NULL, ${U.received_at} TEXT NOT NULL, ${U.due_at} TEXT NOT NULL, ${U.completed_at} TEXT
      );
      CREATE TABLE ${I.table} (
        ${I.update_id} TEXT NOT NULL REFERENCES ${U.table}, ${I.doc_id} TEXT NOT NULL REFERENCES ${D.table},
        ${I.impact_type} TEXT NOT NULL CHECK (${I.impact_type} IN ('amends','repeals','supersedes')),
        PRIMARY KEY (${I.update_id}, ${I.doc_id})
      );
      CREATE TABLE ${T.table} (
        ${T.task_id} TEXT PRIMARY KEY, ${T.update_id} TEXT NOT NULL, ${T.doc_id} TEXT NOT NULL,
        ${T.doc_type} TEXT NOT NULL, ${T.jurisdiction} TEXT NOT NULL, ${T.assigned_at} TEXT NOT NULL, ${T.completed_at} TEXT,
        ${T.classified_by} TEXT NOT NULL CHECK (${T.classified_by} IN ('manual','auto')),
        ${T.classification_correct} TEXT CHECK (${T.classification_correct} IN ('TRUE','FALSE')),
        ${T.rework_needed} TEXT CHECK (${T.rework_needed} IN ('TRUE','FALSE')),
        FOREIGN KEY (${T.update_id}, ${T.doc_id}) REFERENCES ${I.table} (${I.update_id}, ${I.doc_id})
      );
      CREATE INDEX legal_citations_cited ON ${C.table} (${C.cited_doc_id});
      CREATE INDEX legal_citations_citing ON ${C.table} (${C.citing_doc_id});
      CREATE INDEX legal_impacts_document ON ${I.table} (${I.doc_id});
      CREATE INDEX legal_updates_jurisdiction ON ${U.table} (${U.jurisdiction});
      CREATE INDEX legal_tasks_group_type ON ${T.table} (${T.classified_by}, ${T.doc_type});
    `);
    const documents = [];
    const insertDocument = db.prepare(`INSERT INTO ${D.table} VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const names = ["Harlow", "Vellin", "Orwick", "Darnel", "Merrow", "Zelwick", "Farneth", "Tavren"];
    const companies = ["Pemberton Holdings", "Velwick Works", "Orlath Trading", "Zarnell Services"];
    for (let n = 1; n <= 300; n++) {
      const type = n <= 220 ? "case" : n <= 270 ? "statute" : "regulation";
      const jurisdiction = jurisdictions[(n - 1) % 9];
      const level = type === "case" ? integer(1, 3) : null;
      // Reserve early targets and late authorities so every planted citation is chronological.
      const year = n <= 40 ? 1995 + n % 5 : n >= 190 && n <= 220 ? 2024 : integer(2000, 2023);
      const date = `${year}-${String(integer(1, 12)).padStart(2, "0")}-01 00:00:00`;
      const title = type === "case" ? `${names[(n - 1) % names.length]} v. ${companies[integer(0, 3)]} (${n})` : `${jurisdiction} ${type === "statute" ? "Civic Records Act" : "Records Administration Regulation"} ${n}`;
      const court = level === null ? null : `${jurisdiction} ${["District Court", "Court of Appeal", "Supreme Court"][level - 1]}`;
      const document = { id: id("LD", n), type, jurisdiction, level, date, title, court, status: "good_law" };
      documents.push(document);
    }
    const truth = { overruledIds: [], staleStatusOverruledIds: [], questionableIds: [], decoyIds: [], supersededIds: [], lateJurisdictions, tinyJurisdiction: "Pellham" };
    const citations = [];
    function cite(citing, cited, treatment) {
      const snippets = {
        follows: "The later court follows the earlier reasoning on record access.",
        distinguishes: "The later court distinguishes the earlier reasoning on different filing facts.",
        criticizes: "The later court mildly criticizes the earlier approach to record notice.",
        overrules: "The later court declares the earlier case overruled on record notice.",
      };
      citations.push([id("LC", citations.length + 1, 6), citing.id, cited.id, treatment, citing.date, snippets[treatment]]);
    }
    function authority(target, lower = false, foreign = false) {
      const candidates = documents.filter((doc) => doc.type === "case" && doc.date > target.date
        && (foreign ? doc.jurisdiction !== target.jurisdiction : doc.jurisdiction === target.jurisdiction)
        && (lower ? doc.level < target.level : doc.level >= target.level));
      if (!candidates.length) throw new Error("Unable to plant legal authority");
      return candidates[candidates.length - 1];
    }
    for (let n = 0; n < 15; n++) {
      const target = documents[n];
      target.level = 1;
      truth.overruledIds.push(target.id);
      if (n < 12) target.status = "overruled";
      else truth.staleStatusOverruledIds.push(target.id);
      cite(authority(target), target, "overrules");
    }
    for (let n = 15; n < 20; n++) {
      const target = documents[n];
      target.level = 3;
      truth.questionableIds.push(target.id);
      cite(authority(target, true), target, "criticizes");
      if (n % 2) cite(authority(target, true), target, "criticizes");
    }
    for (let n = 20; n < 23; n++) {
      const target = documents[n];
      target.level = 3;
      truth.decoyIds.push(target.id);
      truth.questionableIds.push(target.id);
      cite(authority(target, n !== 22, n === 22), target, "overrules");
    }
    for (let n = 23; n < 27; n++) {
      const target = documents[n];
      target.level = 1;
      truth.questionableIds.push(target.id);
      cite(authority(target), target, "criticizes");
      for (let j = 0; j < 8; j++) cite(authority(target), target, "follows");
    }
    for (const [index, n] of [220, 221, 222, 270, 271, 272].entries()) {
      documents[n].date = "2000-01-01 00:00:00";
      truth.supersededIds.push(documents[n].id);
      if (index < 4) documents[n].status = "superseded";
    }
    for (const doc of documents) {
      const court = doc.level === null ? null : `${doc.jurisdiction} ${["District Court", "Court of Appeal", "Supreme Court"][doc.level - 1]}`;
      insertDocument.run(doc.id, doc.type, doc.title, doc.jurisdiction, court, doc.level, doc.date, doc.status,
        "This invented document addresses administrative record notice.",
        "The fictional dispute concerns the delivery of a record notice. The text discusses consistent filing procedures. Its reasoning is provided solely for demonstration.");
    }
    const normalTargets = documents.filter((doc) => !truth.overruledIds.includes(doc.id) && !truth.questionableIds.includes(doc.id));
    const candidates = documents.filter((doc) => doc.type === "case");
    while (citations.length < 900) {
      const target = normalTargets[integer(0, normalTargets.length - 1)];
      const later = candidates.filter((doc) => doc.date > target.date);
      if (!later.length) continue;
      cite(later[integer(0, later.length - 1)], target, random() < 0.75 ? "follows" : "distinguishes");
    }
    const insertCitation = db.prepare(`INSERT INTO ${C.table} VALUES (?,?,?,?,?,?)`);
    for (const row of citations) insertCitation.run(...row);
    const updates = [];
    const impacts = [];
    const insertUpdate = db.prepare(`INSERT INTO ${U.table} VALUES (?,?,?,?,?,?)`);
    const insertImpact = db.prepare(`INSERT INTO ${I.table} VALUES (?,?,?)`);
    for (let j = 0; j < jurisdictions.length; j++) {
      const jurisdiction = jurisdictions[j];
      const count = j === 8 ? 4 : j < 4 ? 50 : 49;
      for (let n = 0; n < count; n++) {
        const pending = j < 6 && n === 1;
        const overdue = j < 6 && (n === 2 || n === 3);
        // Approved exception: six pending updates are published after the normal Sep 25 cutoff.
        const published = pending ? epoch("2026-09-30 00:00:00") : epoch("2024-01-01 00:00:00") + integer(0, 998) * 24 * hour;
        const received = published + integer(0, 6) * hour;
        const late = j === 8 ? n < 3 : lateJurisdictions.includes(jurisdiction) ? n % 2 === 0 : n % 10 === 0;
        const completed = pending || overdue ? null : stamp(received + (late ? integer(80, 120) : integer(12, 68)) * hour);
        const update = { id: id("RU", updates.length + 1), jurisdiction, received, published, completed };
        updates.push(update);
        insertUpdate.run(update.id, jurisdiction, stamp(published), stamp(received), stamp(received + DEADLINE_HOURS * hour), completed);
        const local = documents.filter((doc) => doc.jurisdiction === jurisdiction);
        const selected = new Set();
        const superseded = local.find((doc) => truth.supersededIds.includes(doc.id));
        if (n === 0 && superseded) selected.add(superseded);
        const wanted = integer(1, 3);
        while (selected.size < wanted) selected.add(local[integer(0, local.length - 1)]);
        for (const doc of selected) {
          const type = n === 0 && doc === superseded ? (j % 2 ? "repeals" : "supersedes") : "amends";
          insertImpact.run(update.id, doc.id, type);
          impacts.push({ update, doc });
        }
      }
    }
    const insertTask = db.prepare(`INSERT INTO ${T.table} VALUES (?,?,?,?,?,?,?,?,?,?)`);
    // Fixed type/group allocation makes mix and within-type quality differences reproducible.
    const allocations = { case: { manual: 240, auto: 80 }, statute: { manual: 56, auto: 104 }, regulation: { manual: 42, auto: 78 } };
    let taskCount = 0;
    for (const type of DOC_TYPES) {
      const available = impacts.filter(({ doc }) => doc.type === type);
      for (const group of ["manual", "auto"]) {
        const count = allocations[type][group];
        const completeCount = count - Math.round(count * 0.05);
        const correctCount = Math.round(completeCount * (group === "auto" ? 0.82 : 0.93));
        const reworkCount = Math.round(completeCount * (group === "auto" ? 0.18 : 0.08));
        for (let n = 0; n < count; n++) {
          const { update, doc } = available[integer(0, available.length - 1)];
          const assigned = update.received + integer(1, 20) * hour;
          const duration = (group === "auto" ? 6 : 10) + (random() - 0.5) * 2;
          const completed = n < completeCount ? stamp(assigned + duration * hour) : null;
          insertTask.run(id("ET", ++taskCount), update.id, doc.id, type, doc.jurisdiction, stamp(assigned), completed, group,
            completed === null ? null : n < correctCount ? "TRUE" : "FALSE",
            completed === null ? null : n < reworkCount ? "TRUE" : "FALSE");
        }
      }
    }
    const counts = {};
    for (const table of [D, C, U, I, T]) counts[table.table] = db.prepare(`SELECT COUNT(*) AS n FROM ${table.table}`).get().n;
    return { counts, truth };
  })();
}

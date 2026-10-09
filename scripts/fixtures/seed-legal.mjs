#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { generateLegal, LEGAL_CONFIG } from "./generate-legal.mjs";

const { AS_OF, LEGAL_DOCUMENTS: D, LEGAL_CITATIONS: C, REGULATORY_UPDATES: U, REGULATORY_UPDATE_IMPACTS: I, EDITORIAL_TASKS: T } = LEGAL_CONFIG;

const publishing = ["authors", "citations", "institutions", "manuscripts", "peer_review_assignments", "research_integrity_flags", "research_papers_published"];
const legalTables = [D.table, C.table, U.table, I.table, T.table];
const DB_PATH = path.join(process.cwd(), "hackathon.db");

function main() {
  if (process.argv.length > 2) throw new Error("legal seed does not accept target overrides");
  const db = new Database(DB_PATH, { fileMustExist: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
    const missing = publishing.filter((table) => !tables.includes(table));
    if (missing.length) throw new Error(`Refusing to seed: missing publishing tables: ${missing.join(", ")}`);
    db.pragma("foreign_keys = ON");
    const { counts, truth } = generateLegal(db);
    const generated = path.join(process.cwd(), ".generated");
    fs.mkdirSync(generated, { recursive: true });
    fs.writeFileSync(path.join(generated, "legal-truth.json"), JSON.stringify(truth, null, 2) + "\n");
    console.log("Legal row counts:", counts);
    console.log("Late rates (misses / resolved, including open overdue items):");
    console.table(db.prepare(`
      SELECT ${U.jurisdiction} AS jurisdiction,
        SUM(julianday(COALESCE(${U.completed_at}, @asOf)) > julianday(${U.due_at})) AS misses,
        SUM(${U.completed_at} IS NOT NULL OR julianday(@asOf) > julianday(${U.due_at})) AS resolved,
        1.0 * SUM(julianday(COALESCE(${U.completed_at}, @asOf)) > julianday(${U.due_at}))
          / SUM(${U.completed_at} IS NOT NULL OR julianday(@asOf) > julianday(${U.due_at})) AS lateRate
      FROM ${U.table} GROUP BY ${U.jurisdiction}
    `).all({ asOf: AS_OF }));
    console.log("Auto vs manual counts per doc_type:");
    console.table(db.prepare(`SELECT ${T.doc_type}, ${T.classified_by}, COUNT(*) AS n FROM ${T.table} GROUP BY ${T.doc_type}, ${T.classified_by}`).all());
    console.log("Tables NOT touched:", tables.filter((table) => !legalTables.includes(table)).join(", "));
  } finally {
    db.close();
  }
}

try { main(); } catch (error) {
  console.error(`Legal seed failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
}

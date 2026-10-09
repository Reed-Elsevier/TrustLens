#!/usr/bin/env node
/**
 * Empties data/test-fixture.db: deletes every row from every table but leaves the
 * schema (and the file itself) in place, then reclaims disk space.
 *
 * Usage: node scripts/fixtures/reset-hackathon-db.mjs
 */
import fs from "node:fs";
import Database from "better-sqlite3";
import { assertSafeFixtureTarget } from "./fixture-db.mjs";

if (process.argv.length > 2) throw new Error("Fixture scripts do not accept a target override.");
const DB_PATH = assertSafeFixtureTarget();

if (!fs.existsSync(DB_PATH)) {
  console.log("No data/test-fixture.db found; nothing to empty.");
  process.exit(0);
}

const db = new Database(DB_PATH);

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .all()
  .map((r) => r.name);

const deleteAll = db.transaction(() => {
  for (const table of tables) {
    const identifier = `"${table.replaceAll('"', '""')}"`;
    db.prepare(`DELETE FROM ${identifier}`).run();
  }
});
deleteAll();

db.exec("VACUUM");
db.close();

console.log(`Emptied ${tables.length} table(s) in ${DB_PATH}: ${tables.join(", ")}`);

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

export const FIXTURE_PATH = fileURLToPath(new URL("../../data/test-fixture.db", import.meta.url));

export function assertFixtureRowLimit(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  for (const { name } of tables) {
    const identifier = `"${name.replaceAll('"', '""')}"`;
    if (db.prepare(`SELECT COUNT(*) AS count FROM ${identifier}`).get().count > 100) {
      throw new Error("Refusing to modify a database containing more than 100 rows in a table.");
    }
  }
}

export function assertSafeFixtureTarget(target = FIXTURE_PATH) {
  const resolved = path.resolve(target);
  if (path.basename(resolved).toLowerCase() === "hackathon.db" || resolved !== FIXTURE_PATH) {
    throw new Error("Fixture scripts may only target data/test-fixture.db, never hackathon.db.");
  }
  const parent = path.dirname(resolved);
  if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) {
    throw new Error("Refusing to use a linked fixture directory.");
  }
  if (!fs.existsSync(resolved)) return resolved;
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error("Refusing to use a linked or non-file fixture target.");
  }
  const db = new Database(resolved, { readonly: true, fileMustExist: true });
  try {
    assertFixtureRowLimit(db);
  } finally {
    db.close();
  }
  return resolved;
}

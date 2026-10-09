import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import ts from "typescript";
import { generateLegal } from "./generate-legal.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "trustlens-legal-"));
const fixturePath = path.join(directory, "legal.db");
const writable = new Database(fixturePath);
writable.pragma("foreign_keys = ON");
writable.exec("CREATE TABLE publishing_sentinel (value TEXT); INSERT INTO publishing_sentinel VALUES ('untouched')");
const { counts, truth } = generateLegal(writable);
writable.close();
const db = new Database(fixturePath, { readonly: true, fileMustExist: true });
db.pragma("query_only = true");
const previousDb = globalThis.__trustlensDb;
globalThis.__trustlensDb = db;

// Mirror the publishing fixture's temporary TypeScript and @/ resolution hooks.
function loadLegalModules() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const require = createRequire(import.meta.url);
  const resolve = Module._resolveFilename;
  const previousTsLoader = require.extensions[".ts"];
  Module._resolveFilename = function (request, parent, ...rest) {
    return resolve.call(this, request.startsWith("@/") ? path.join(root, request.slice(2)) : request, parent, ...rest);
  };
  require.extensions[".ts"] = function (module, filename) {
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    });
    module._compile(output.outputText, filename);
  };
  try {
    return {
      deadlines: require(path.join(root, "lib", "legal", "deadlines.ts")),
      pilot: require(path.join(root, "lib", "legal", "pilot.ts")),
      goodLaw: require(path.join(root, "lib", "legal", "goodLaw.ts")),
      stats: require(path.join(root, "lib", "legal", "stats.ts")),
      http: require(path.join(root, "lib", "legal", "http.ts")),
      config: require(path.join(root, "lib", "legal", "config.ts")),
      claude: require(path.join(root, "lib", "claude.ts")),
      deadlinesRoute: require(path.join(root, "app", "api", "legal", "deadlines", "route.ts")),
      pilotRoute: require(path.join(root, "app", "api", "legal", "pilot", "route.ts")),
      documentsRoute: require(path.join(root, "app", "api", "legal", "documents", "route.ts")),
      goodLawRoute: require(path.join(root, "app", "api", "legal", "good-law", "route.ts")),
    };
  } finally {
    Module._resolveFilename = resolve;
    if (previousTsLoader) require.extensions[".ts"] = previousTsLoader;
    else delete require.extensions[".ts"];
  }
}
const modules = loadLegalModules();
const originalClient = modules.claude.getClaudeClient;
const originalTimeout = modules.config.AI_CONFIG.timeoutMs;
const request = (endpoint) => new Request(`http://fixture.local/api/legal/${endpoint}`);
const response = (text) => ({ content: [{ type: "text", text }] });
const legalExplanation = { verdict: "overruled", confidence: "high", reasoning: "A later binding authority overrules this case.", supportingDocIds: [], caveats: [] };

beforeEach(() => {
  modules.claude.getClaudeClient = () => { throw new Error("Live Bedrock traffic forbidden in fixture tests"); };
  modules.config.AI_CONFIG.timeoutMs = originalTimeout;
});
after(() => {
  modules.claude.getClaudeClient = originalClient;
  modules.config.AI_CONFIG.timeoutMs = originalTimeout;
  if (previousDb) globalThis.__trustlensDb = previousDb;
  else delete globalThis.__trustlensDb;
  db.close();
  fs.unlinkSync(fixturePath);
  fs.rmdirSync(directory);
});

test("all planted adverse verdicts, decoys and stale statuses follow deterministic rules", () => {
  for (const [ids, expected] of [[truth.overruledIds, "overruled"], [truth.questionableIds, "questionable"], [truth.supersededIds, "superseded"]]) {
    for (const docId of ids) {
      const result = modules.goodLaw.checkGoodLaw(docId, db);
      assert.equal(result.finalVerdict, expected, docId);
    }
  }
  for (const docId of truth.decoyIds) assert.notEqual(modules.goodLaw.checkGoodLaw(docId, db).finalVerdict, "overruled");
  for (const docId of truth.staleStatusOverruledIds) assert.equal(modules.goodLaw.checkGoodLaw(docId, db).statusMismatch, true);
});

test("30 reproducibly shuffled unplanted cases are not overruled", () => {
  const excluded = new Set([...truth.overruledIds, ...truth.questionableIds, ...truth.supersededIds]);
  const candidates = db.prepare("SELECT doc_id FROM legal_documents WHERE doc_type = 'case'").all().filter((row) => !excluded.has(row.doc_id));
  let seed = 42;
  for (let i = candidates.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const { doc_id: docId } of candidates.slice(0, 30)) assert.notEqual(modules.goodLaw.checkGoodLaw(docId, db).finalVerdict, "overruled");
});

test("deadlines rank planted late jurisdictions and exclude the tiny sample", () => {
  const result = modules.deadlines.getDeadlines(20, db);
  assert.deepEqual(new Set(result.ranked.slice(0, 3).map((row) => row.jurisdiction)), new Set(truth.lateJurisdictions));
  assert.ok(result.lowSample.some((row) => row.jurisdiction === truth.tinyJurisdiction));
  assert.equal(result.overall.total, counts.regulatory_updates);
  assert.equal(result.meta.warnings.length, 0);
  const all = [...result.ranked, ...result.lowSample];
  assert.equal(all.reduce((sum, row) => sum + row.pending, 0), 6);
  assert.equal(all.reduce((sum, row) => sum + row.stillOpenOverdue, 0), 12);
  assert.equal(result.overall.missRate, result.overall.misses / all.reduce((sum, row) => sum + row.resolved, 0));
  for (const row of all) {
    assert.equal(row.total, row.resolved + row.pending);
    assert.equal(row.misses, row.completedLate + row.stillOpenOverdue);
  }
});

test("pilot is faster but worse, has composition confounding, and remains faster/less accurate within every type", () => {
  const result = modules.pilot.getPilot(db);
  assert.equal(result.verdict, "faster_but_worse");
  assert.equal(result.mixWarning, true);
  for (const row of result.byDocType) {
    assert.ok(row.auto.speed.median < row.manual.speed.median);
    assert.ok(row.auto.accuracy < row.manual.accuracy);
    assert.ok(row.auto.reworkRate > row.manual.reworkRate);
    assert.ok(row.manual.nCompleted < row.manual.n);
    assert.ok(row.auto.nCompleted < row.auto.n);
  }
});

test("same seed recreates identical rows and preserves publishing sentinel, including with foreign keys", () => {
  const memory = new Database(":memory:");
  memory.pragma("foreign_keys = ON");
  try {
    memory.exec("CREATE TABLE publishing_sentinel (value TEXT); INSERT INTO publishing_sentinel VALUES ('untouched')");
    const snapshot = () => ["legal_documents", "legal_citations", "regulatory_updates", "regulatory_update_impacts", "editorial_tasks"].map((table) => memory.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const first = generateLegal(memory, { seed: 42 });
    const rows = snapshot();
    assert.deepEqual(generateLegal(memory, { seed: 42 }), first);
    assert.deepEqual(snapshot(), rows);
    assert.deepEqual(memory.prepare("SELECT * FROM publishing_sentinel").all(), [{ value: "untouched" }]);
    generateLegal(memory, { seed: 7 });
    assert.notDeepEqual(snapshot(), rows);
    assert.equal(memory.pragma("foreign_key_check").length, 0);
    assert.equal(memory.prepare(`SELECT COUNT(*) AS n FROM legal_citations c JOIN legal_documents citing ON citing.doc_id = c.citing_doc_id
      JOIN legal_documents cited ON cited.doc_id = c.cited_doc_id WHERE citing.decision_date <= cited.decision_date OR c.citation_date != citing.decision_date`).get().n, 0);
  } finally { memory.close(); }
});

test("generated schema, IDs, dates, authority patterns, update rates and task allocations satisfy the dataset contract", () => {
  assert.equal(counts.legal_documents, 300);
  assert.equal(counts.legal_citations, 900);
  assert.equal(counts.regulatory_updates, 400);
  assert.equal(counts.editorial_tasks, 600);
  assert.deepEqual(db.prepare("SELECT doc_type, COUNT(*) AS n FROM legal_documents GROUP BY doc_type ORDER BY doc_type").all(),
    [{ doc_type: "case", n: 220 }, { doc_type: "regulation", n: 30 }, { doc_type: "statute", n: 50 }]);
  for (const [table, column, regex] of [["legal_documents", "doc_id", /^LD\d{5}$/], ["legal_citations", "citation_id", /^LC\d{6}$/],
    ["regulatory_updates", "update_id", /^RU\d{5}$/], ["editorial_tasks", "task_id", /^ET\d{5}$/]]) {
    for (const row of db.prepare(`SELECT ${column} AS id FROM ${table}`).all()) assert.match(row.id, regex);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM legal_documents WHERE doc_type != 'case' AND (court IS NOT NULL OR court_level IS NOT NULL)").get().n, 0);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM legal_citations c
    JOIN legal_documents cited ON cited.doc_id = c.cited_doc_id
    WHERE cited.doc_type != 'case' AND c.treatment NOT IN ('follows','distinguishes')`).get().n, 0);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM regulatory_update_impacts i
    JOIN regulatory_updates u ON u.update_id = i.update_id JOIN legal_documents d ON d.doc_id = i.doc_id
    WHERE u.jurisdiction != d.jurisdiction`).get().n, 0);
  const updates = db.prepare("SELECT *, (julianday(due_at) - julianday(received_at)) * 24 AS hours FROM regulatory_updates").all();
  for (const row of updates) {
    assert.ok(Math.abs(row.hours - 72) < 0.000001);
    assert.ok(row.received_at >= row.published_at);
    assert.ok(row.published_at >= "2024-01-01 00:00:00");
    assert.ok(row.published_at <= "2026-09-25 23:59:59" || (row.completed_at === null && row.due_at > modules.config.AS_OF));
  }
  for (const jurisdiction of db.prepare("SELECT DISTINCT jurisdiction FROM regulatory_updates").all().map((row) => row.jurisdiction)) {
    const completed = updates.filter((row) => row.jurisdiction === jurisdiction && row.completed_at !== null);
    const rate = completed.filter((row) => row.completed_at > row.due_at).length / completed.length;
    if (jurisdiction === truth.tinyJurisdiction) assert.equal(rate, 0.75);
    else if (truth.lateJurisdictions.includes(jurisdiction)) assert.ok(rate >= 0.4 && rate <= 0.6);
    else assert.ok(rate >= 0.05 && rate <= 0.15);
  }
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM editorial_tasks t
    JOIN legal_documents d ON d.doc_id = t.doc_id JOIN regulatory_updates u ON u.update_id = t.update_id
    WHERE t.doc_type != d.doc_type OR t.jurisdiction != d.jurisdiction
      OR (julianday(t.assigned_at) - julianday(u.received_at)) * 24 < 0.99999
      OR (julianday(t.assigned_at) - julianday(u.received_at)) * 24 > 20.00001
      OR (t.completed_at IS NULL AND (t.classification_correct IS NOT NULL OR t.rework_needed IS NOT NULL))`).get().n, 0);
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'").all();
  assert.equal(indexes.length, 5);
});

test("deadline equality is not a miss; pending denominator and due mismatch warnings use stored deadlines", () => {
  const memory = new Database(":memory:");
  try {
    memory.exec("CREATE TABLE regulatory_updates (jurisdiction TEXT, received_at TEXT, due_at TEXT, completed_at TEXT)");
    const insert = memory.prepare("INSERT INTO regulatory_updates VALUES (?,?,?,?)");
    insert.run("Testland", "2026-09-28 00:00:00", "2026-10-01 00:00:00", null);
    insert.run("Testland", "2026-09-27 00:00:00", "2026-09-30 00:00:00", "2026-09-30 00:00:00");
    insert.run("Testland", "2026-09-26 00:00:00", "2026-09-30 00:00:00", null);
    const result = modules.deadlines.getDeadlines(1, memory);
    assert.equal(result.meta.warnings.length, 1);
    assert.match(result.meta.warnings[0], /^1 update/);
    assert.equal(result.ranked[0].misses, 1);
    assert.equal(result.ranked[0].resolved, 2);
    assert.equal(result.ranked[0].medianHoursLate, 24);
    assert.equal(result.ranked[0].p90HoursLate, 24);
    assert.equal(result.ranked[0].pending, 1);
  } finally { memory.close(); }
});

test("statistical helpers handle empty, constant and insufficient groups", () => {
  assert.equal(modules.stats.median([]), null);
  assert.equal(modules.stats.median([3, 1, 2, 4]), 2.5);
  assert.deepEqual(modules.stats.twoProportionZ(0, 0, 0, 10), { z: null, significant: false });
  assert.deepEqual(modules.stats.twoProportionZ(30, 30, 30, 30), { z: 0, significant: false });
  assert.equal(modules.stats.twoProportionZ(0, 29, 30, 30).significant, false);
  assert.equal(modules.stats.twoProportionZ(0, 30, 30, 30).significant, true);
});

test("generation refuses inbound foreign keys rather than cascading into unrelated tables", () => {
  const memory = new Database(":memory:");
  memory.pragma("foreign_keys = ON");
  try {
    generateLegal(memory);
    memory.exec(`CREATE TABLE publishing_sentinel (doc_id TEXT REFERENCES legal_documents(doc_id) ON DELETE CASCADE);
      INSERT INTO publishing_sentinel VALUES ('LD00001')`);
    assert.throws(() => generateLegal(memory), /unrelated table/);
    assert.deepEqual(memory.prepare("SELECT * FROM publishing_sentinel").all(), [{ doc_id: "LD00001" }]);
    assert.equal(memory.prepare("SELECT COUNT(*) AS n FROM legal_documents").get().n, 300);
  } finally { memory.close(); }
});

test("rule priority, empty evidence, reversed statuses and chronological authority boundaries", () => {
  const memory = new Database(":memory:");
  try {
    generateLegal(memory);
    const target = truth.overruledIds[0];
    const binding = modules.goodLaw.checkGoodLaw(target, memory).keyAuthorities.bindingOverrulings[0];
    memory.prepare("UPDATE legal_documents SET decision_date = ? WHERE doc_id = ?").run(binding.decision_date, target);
    assert.equal(modules.goodLaw.checkGoodLaw(target, memory).finalVerdict, "questionable");
    memory.prepare("DELETE FROM legal_citations WHERE cited_doc_id = ?").run(target);
    memory.prepare("DELETE FROM editorial_tasks WHERE doc_id = ?").run(target);
    memory.prepare("DELETE FROM regulatory_update_impacts WHERE doc_id = ?").run(target);
    const empty = modules.goodLaw.checkGoodLaw(target, memory);
    assert.equal(empty.finalVerdict, "good_law");
    assert.equal(empty.confidence, "low");
    assert.deepEqual(empty.reasons, ["no later treatment found"]);
    assert.equal(empty.statusMismatch, true);
    const update = memory.prepare("SELECT update_id FROM regulatory_updates LIMIT 1").get().update_id;
    memory.prepare("UPDATE regulatory_updates SET published_at = '2026-01-01 00:00:00' WHERE update_id = ?").run(update);
    memory.prepare("INSERT INTO regulatory_update_impacts VALUES (?, ?, 'supersedes')").run(update, target);
    assert.equal(modules.goodLaw.checkGoodLaw(target, memory).finalVerdict, "superseded");
    memory.prepare("UPDATE legal_documents SET decision_date = '1995-01-01 00:00:00' WHERE doc_id = ?").run(target);
    memory.prepare("INSERT INTO legal_citations VALUES ('LC999999', ?, ?, 'overrules', ?, 'Earlier case overruled.')").run(binding.doc_id, target, binding.decision_date);
    assert.equal(modules.goodLaw.checkGoodLaw(target, memory).finalVerdict, "overruled");
  } finally { memory.close(); }
});

test("all pilot verdict branches use the defined speed and significance thresholds", () => {
  const memory = new Database(":memory:");
  try {
    memory.exec("CREATE TABLE editorial_tasks (doc_type TEXT, classified_by TEXT, assigned_at TEXT, completed_at TEXT, classification_correct TEXT, rework_needed TEXT)");
    const insert = memory.prepare("INSERT INTO editorial_tasks VALUES ('case', ?, '2026-01-01 00:00:00', ?, ?, ?)");
    const fill = (autoHours, manualCorrect, autoCorrect, manualRework, autoRework) => {
      memory.exec("DELETE FROM editorial_tasks");
      for (const group of ["manual", "auto"]) {
        for (let n = 0; n < 100; n++) insert.run(group, group === "manual" ? "2026-01-01 10:00:00" : `2026-01-01 ${autoHours}:00:00`,
          n < (group === "manual" ? manualCorrect : autoCorrect) ? "TRUE" : "FALSE",
          n < (group === "manual" ? manualRework : autoRework) ? "TRUE" : "FALSE");
      }
      return modules.pilot.getPilot(memory).verdict;
    };
    assert.equal(fill("06", 80, 98, 20, 2), "faster_and_better");
    assert.equal(fill("06", 98, 80, 2, 20), "faster_but_worse");
    assert.equal(fill("06", 90, 90, 10, 10), "faster_only");
    assert.equal(fill("09", 90, 90, 10, 10), "faster_only");
    assert.equal(fill("11", 90, 90, 10, 10), "slower");
    assert.equal(fill("10", 90, 90, 10, 10), "no_clear_change");
  } finally { memory.close(); }
});

test("routes validate input, unknown IDs, output shape and escaped LIKE search", async () => {
  for (const [route, endpoint] of [
    [modules.goodLawRoute, "good-law?docId=abc"], [modules.goodLawRoute, "good-law?docId=LD00001&explain=2"],
    [modules.deadlinesRoute, "deadlines?minSample=0"], [modules.deadlinesRoute, "deadlines?minSample=201"],
    [modules.deadlinesRoute, "deadlines?minSample=1.5"], [modules.deadlinesRoute, "deadlines?summary=true"],
    [modules.pilotRoute, "pilot?summary=2"], [modules.documentsRoute, "documents?limit=51"],
    [modules.documentsRoute, "documents?docType=invalid"],
  ]) {
    const res = await route.GET(request(endpoint));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "BAD_REQUEST");
  }
  assert.equal((await modules.goodLawRoute.GET(request("good-law?docId=LD99999"))).status, 404);
  assert.equal((await modules.goodLawRoute.GET(request("good-law?docId=LD00001"))).status, 200);
  const result = await (await modules.deadlinesRoute.GET(request("deadlines"))).json();
  assert.equal(result.summary, null);
  assert.equal(result.summarySource, null);
  assert.equal(result.meta.clock, "received_at");
  assert.equal(modules.goodLaw.searchDocuments("%", undefined, undefined, 20, db).length, 0);
  assert.equal(modules.goodLaw.searchDocuments("_", undefined, undefined, 20, db).length, 0);
  const documents = await (await modules.documentsRoute.GET(request("documents?docType=statute&limit=5"))).json();
  assert.equal(documents.items.length, 5);
  assert.ok(documents.items.every((doc) => doc.doc_type === "statute" && doc.court === null));
  assert.ok(!Object.hasOwn(documents.items[0], "full_text"));
});

test("summary failures produce explicit deterministic fallback and summaries obey word limits", async () => {
  modules.claude.getClaudeClient = () => ({ messages: { create: async () => response(Array(91).fill("word").join(" ")) } });
  assert.equal((await modules.deadlines.deadlineReport(20, true, db)).summarySource, "fallback");
  assert.equal((await modules.pilot.pilotReport(true, db)).summarySource, "fallback");
  modules.claude.getClaudeClient = () => ({ messages: { create: async () => response("Computed results show a speed and quality trade-off.") } });
  assert.equal((await modules.deadlines.deadlineReport(20, true, db)).summarySource, "claude");
  assert.equal((await modules.pilot.pilotReport(true, db)).summarySource, "claude");
});

test("good-law invalid JSON retries once, sanitizes unsupported IDs and caches successful answers", async () => {
  let calls = 0;
  const sent = modules.goodLaw.checkGoodLaw("LD00001", db).evidence;
  modules.claude.getClaudeClient = () => ({ messages: { create: async (payload, options) => {
    calls++;
    assert.equal(options.maxRetries, 0);
    assert.ok(options.signal instanceof AbortSignal);
    assert.ok(options.timeout <= 20_000);
    const evidence = JSON.parse(payload.messages[0].content);
    assert.ok(evidence.citations.length <= 8);
    assert.ok(evidence.citations.every((row) => row.context_snippet.length <= 300));
    return calls === 1 ? response("invalid JSON") : response("```json\n" + JSON.stringify({
      ...legalExplanation, supportingDocIds: [sent.citations[0].doc_id, "LD99999"],
    }) + "\n```");
  } } });
  const result = await modules.goodLaw.goodLawReport("LD00001", true, db);
  assert.equal(result.source, "claude");
  assert.equal(result.disagreement, false);
  assert.equal(calls, 2);
  assert.deepEqual(result.explanation.supportingDocIds, [sent.citations[0].doc_id]);
  assert.ok(result.explanation.caveats.some((note) => note.includes("Unsupported")));
  await modules.goodLaw.goodLawReport("LD00001", true, db);
  assert.equal(calls, 2);
});

test("Claude disagreement never overrides rule verdict", async () => {
  modules.claude.getClaudeClient = () => ({ messages: { create: async () => response(JSON.stringify({ ...legalExplanation, verdict: "good_law" })) } });
  const result = await modules.goodLaw.goodLawReport("LD00002", true, db);
  assert.equal(result.finalVerdict, "overruled");
  assert.equal(result.explanation.verdict, "good_law");
  assert.equal(result.disagreement, true);
  assert.equal(result.needsHumanReview, true);
});

test("invalid shapes retry once; network failures do not retry or cache and reveal no raw errors", async (t) => {
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args.join(" ")));
  let calls = 0;
  modules.claude.getClaudeClient = () => ({ messages: { create: async () => {
    calls++;
    return response(JSON.stringify({ ...legalExplanation, reasoning: Array(81).fill("word").join(" ") }));
  } } });
  assert.equal((await modules.goodLaw.goodLawReport("LD00003", true, db)).source, "fallback");
  assert.equal(calls, 2);
  calls = 0;
  modules.claude.getClaudeClient = () => ({ messages: { create: async () => { calls++; throw new Error("sensitive upstream text"); } } });
  const result = await modules.goodLaw.goodLawReport("LD00003", true, db);
  assert.equal(result.source, "fallback");
  assert.equal(calls, 1);
  await modules.goodLaw.goodLawReport("LD00003", true, db);
  assert.equal(calls, 2);
  assert.ok(logs.every((line) => !line.includes("sensitive upstream text")));
  assert.ok(!JSON.stringify(result).includes("sensitive upstream text"));
});

test("hanging Claude requests fall back exactly at the shared 20-second budget even if SDK ignores abort", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let signal;
  let calls = 0;
  modules.claude.getClaudeClient = () => ({ messages: { create: (_payload, options) => {
    signal = options.signal;
    calls++;
    return new Promise(() => {});
  } } });
  const pending = modules.goodLaw.goodLawReport("LD00004", true, db);
  t.mock.timers.tick(19_999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  assert.equal((await pending).source, "fallback");
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
});

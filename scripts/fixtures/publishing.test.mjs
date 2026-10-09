import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import fs from "node:fs";
import Database from "better-sqlite3";
import { assertFixtureRowLimit, assertSafeFixtureTarget, FIXTURE_PATH } from "./fixture-db.mjs";
import { loadPublishingModules } from "./load-publishing.mjs";

const db = new Database(FIXTURE_PATH, { readonly: true, fileMustExist: true });
db.pragma("query_only = true");
globalThis.__trustlensDb = db;
const modules = loadPublishingModules();
const originalQueries = { ...modules.queries };
const originalClient = modules.claude.getClaudeClient;
const valid = { summary: "Statistical signals warrant review, not a finding of misconduct.", keyFindings: [], caveats: [], suggestedNextSteps: [] };
const originalTimeout = modules.config.EXPLAIN_CONFIG.timeoutMs;
const textResponse = (text) => ({ content: [{ type: "text", text }] });
const jsonResponse = (value) => textResponse(JSON.stringify(value));
const request = (endpoint, body) => new Request(`http://fixture.local/api/publishing/${endpoint}`, body === undefined ? undefined : {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const explanation = () => modules.explain.explainManuscript("MS00000001");

beforeEach(() => {
  Object.assign(modules.queries, originalQueries);
  modules.claude.getClaudeClient = originalClient;
  modules.config.EXPLAIN_CONFIG.timeoutMs = originalTimeout;
  delete globalThis.__trustlensRiskIndex;
  delete globalThis.__trustlensExplainCache;
  modules.rings.resetRingsCache();
});

after(() => {
  Object.assign(modules.queries, originalQueries);
  modules.claude.getClaudeClient = originalClient;
  modules.config.EXPLAIN_CONFIG.timeoutMs = originalTimeout;
  delete globalThis.__trustlensDb;
  db.close();
});

test("fixture guards reject production paths, alternate targets and tables over 100 rows", () => {
  assert.throws(() => assertSafeFixtureTarget("hackathon.db"), /never hackathon/);
  assert.throws(() => assertSafeFixtureTarget("another.db"), /only target/);
  assert.equal(assertSafeFixtureTarget(), FIXTURE_PATH);
  const memory = new Database(":memory:");
  try {
    memory.exec("CREATE TABLE entries (value INTEGER)");
    const insert = memory.prepare("INSERT INTO entries VALUES (?)");
    for (let i = 0; i < 100; i++) insert.run(i);
    assert.doesNotThrow(() => assertFixtureRowLimit(memory));
    insert.run(100);
    assert.throws(() => assertFixtureRowLimit(memory), /more than 100/);
  } finally {
    memory.close();
  }
  for (const script of ["seed-hackathon-db.mjs", "reset-hackathon-db.mjs"]) {
    const source = fs.readFileSync(new URL(script, import.meta.url), "utf8");
    assert.ok(source.includes("const DB_PATH = assertSafeFixtureTarget()"));
  }
});

test("rings include global quality, spec manuscript keys and reject depth", async () => {
  const res = await modules.ringsRoute.GET(request("rings"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(typeof body.meta.global.avgQualityScore, "number");
  assert.ok(body.pairs.length > 0);
  for (const pair of body.pairs) {
    assert.ok(pair.a < pair.b);
    for (const ref of pair.manuscripts) {
      assert.match(ref.manuscript_id, /^MS\d{8}$/);
      assert.ok(!Object.hasOwn(ref, "manuscriptId"));
    }
  }
  assert.equal((await modules.ringsRoute.GET(request("rings?depth=3"))).status, 400);
  assert.ok(!Object.hasOwn(modules.rings, "getRingCycles"));
});

test("detail and explanation evidence use only ring partners who completed this manuscript", () => {
  const rows = db.prepare("SELECT manuscript_id FROM manuscripts").all();
  for (const { manuscript_id: id } of rows) {
    const detail = modules.risk.getManuscriptDetail(id);
    const reviewers = new Set(db.prepare("SELECT reviewer_author_id FROM peer_review_assignments WHERE manuscript_id = ? AND review_submitted_at IS NOT NULL").all(id).map((r) => r.reviewer_author_id));
    for (const pair of detail.ringPartners) {
      const partner = pair.a === detail.correspondingAuthor.authorId ? pair.b : pair.a;
      assert.ok(reviewers.has(partner));
    }
    const packet = modules.explain.buildEvidencePacket(detail);
    assert.equal(packet.ringPartnerCount, detail.ringPartners.length);
    assert.deepEqual(packet.ringPartners.map((p) => [p.a, p.b]), detail.ringPartners.map((p) => [p.a, p.b]));
    assert.ok(!JSON.stringify(packet).includes('"fullName"'));
  }
});

test("parse/shape/word failures retry once; fenced valid results are cached", async () => {
  for (const invalid of [
    "not JSON",
    JSON.stringify({ summary: "Missing fields" }),
    JSON.stringify({ ...valid, keyFindings: [{}] }),
    JSON.stringify({ ...valid, summary: Array(61).fill("word").join(" ") }),
  ]) {
    delete globalThis.__trustlensExplainCache;
    let calls = 0;
    modules.claude.getClaudeClient = () => ({ messages: { create: async () => {
      calls++;
      return calls === 1 ? textResponse(invalid) : textResponse(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``);
    } } });
    const first = await explanation();
    assert.equal(first.source, "claude");
    assert.equal(calls, 2);
    assert.deepEqual(await explanation(), first);
    assert.equal(calls, 2);
  }
});

test("two overlength summaries fall back without caching; 60 words are accepted", async () => {
  let calls = 0;
  modules.claude.getClaudeClient = () => ({ messages: { create: async () => {
    calls++;
    return jsonResponse({ ...valid, summary: Array(61).fill("word").join(" ") });
  } } });
  const fallback = await explanation();
  assert.equal(fallback.source, "fallback");
  assert.equal(calls, 2);
  assert.ok(!globalThis.__trustlensExplainCache.has("MS00000001"));
  assert.deepEqual(await explanation(), fallback);
  assert.equal(calls, 4);
  modules.claude.getClaudeClient = () => ({ messages: { create: async () => jsonResponse({ ...valid, summary: Array(60).fill("word").join(" ") }) } });
  assert.equal((await explanation()).source, "claude");
});

test("network errors go straight to fallback, disable SDK retries and log no raw error", async (t) => {
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args.join(" ")));
  let calls = 0;
  modules.claude.getClaudeClient = () => ({ messages: { create: async (payload, options) => {
    calls++;
    assert.equal(payload.max_tokens, 800);
    assert.equal(options.maxRetries, 0);
    assert.ok(options.signal instanceof AbortSignal);
    assert.ok(options.timeout <= 20_000);
    throw new Error("sensitive upstream text");
  } } });
  const body = await explanation();
  assert.equal(body.source, "fallback");
  assert.equal(calls, 1);
  assert.ok(logs.length > 0 && logs.every((log) => !log.includes("sensitive upstream text")));
  assert.ok(!JSON.stringify(body).includes("sensitive upstream text"));
});

test("a hanging request is aborted once at 20 seconds with no retry", async (t) => {
  assert.equal(modules.config.EXPLAIN_CONFIG.timeoutMs, 20_000);
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let calls = 0;
  let aborted = false;
  modules.claude.getClaudeClient = () => ({ messages: { create: (_payload, { signal }) => {
    calls++;
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true });
    });
  } } });
  const pending = explanation();
  t.mock.timers.tick(19_999);
  assert.equal(aborted, false);
  t.mock.timers.tick(1);
  assert.equal((await pending).source, "fallback");
  assert.equal(calls, 1);
  assert.equal(aborted, true);
});

test("parse retry shares the original timer and abort signal", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const signals = [];
  modules.claude.getClaudeClient = () => ({ messages: { create: (_payload, { signal }) => {
    signals.push(signal);
    if (signals.length === 1) return Promise.resolve(textResponse("invalid"));
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  } } });
  const pending = explanation();
  await new Promise(setImmediate);
  assert.equal(signals.length, 2);
  assert.equal(signals[0], signals[1]);
  t.mock.timers.tick(20_000);
  assert.equal((await pending).source, "fallback");
  assert.equal(signals.length, 2);
});

test("every handler sanitizes unexpected errors and logs duration, including early returns", async (t) => {
  const logs = [];
  t.mock.method(console, "log", (...args) => logs.push(args.join(" ")));
  t.mock.method(console, "error", (...args) => logs.push(args.join(" ")));
  const fail = () => { throw new Error("sensitive upstream text"); };
  modules.queries.getAllManuscripts = fail;
  modules.queries.getManuscriptById = fail;
  const responses = [
    await modules.ringsRoute.GET(request("rings")),
    await modules.riskRoute.GET(request("risk")),
    await modules.detailRoute.GET(request("risk/MS00000001"), { params: Promise.resolve({ manuscriptId: "MS00000001" }) }),
    await modules.explainRoute.POST(request("explain", { manuscriptId: "MS00000001" })),
  ];
  for (const res of responses) {
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: { code: "INTERNAL", message: "Internal server error" } });
  }
  Object.assign(modules.queries, originalQueries);
  const previousLogs = logs.length;
  assert.equal((await modules.ringsRoute.GET(request("rings?minEach=0"))).status, 400);
  assert.equal((await modules.riskRoute.GET(request("risk?limit=0"))).status, 400);
  assert.equal((await modules.detailRoute.GET(request("risk/invalid"), { params: Promise.resolve({ manuscriptId: "invalid" }) })).status, 400);
  assert.equal((await modules.detailRoute.GET(request("risk/MS99999999"), { params: Promise.resolve({ manuscriptId: "MS99999999" }) })).status, 404);
  assert.equal((await modules.explainRoute.POST(request("explain", {}))).status, 400);
  assert.equal((await modules.explainRoute.POST(request("explain", { manuscriptId: "MS99999999" }))).status, 404);
  assert.equal(logs.slice(previousLogs).filter((line) => line.includes("took")).length, 6);
  assert.ok(logs.every((line) => !line.includes("sensitive upstream text")));
});

test("shared error handling preserves Next.js control-flow exceptions", async () => {
  const control = new Error("framework control flow");
  control.digest = "NEXT_REDIRECT;replace;/login;307;";
  await assert.rejects(modules.http.withApiRequest("test framework control", () => { throw control; }), (err) => err === control);
});

test("refresh invalidates ring state and logs its warm-up", async (t) => {
  const logs = [];
  t.mock.method(console, "log", (...args) => logs.push(args.join(" ")));
  const first = modules.risk.getRiskIndex();
  assert.ok(modules.rings.getRingPairs(1).pairs.length > 0);
  modules.queries.getAllCompletedReviews = () => [];
  const refreshed = modules.risk.getRiskIndex(true);
  assert.notEqual(refreshed, first);
  assert.equal(modules.rings.getRingPairs(1).pairs.length, 0);
  assert.equal(logs.filter((line) => line.includes("ring cache warm-up")).length, 2);
  for (const score of refreshed.scores.values()) assert.equal(score.signals.find((s) => s.key === "reviewerRing").points, 0);
});

test("applicable zero-point and NULL-rich signals retain numeric evidence and thresholds", () => {
  const originalManuscripts = originalQueries.getAllManuscripts();
  const source = { ...originalManuscripts[0], similarity_score_pct: null, handling_editor_author_id: null, turnaround_days: null, revision_rounds: null };
  modules.queries.getAllManuscripts = () => [source];
  const review = { ...originalQueries.getAllCompletedReviews()[0], review_days: null, review_word_count: null, review_quality_score: null, recommendation: null };
  modules.queries.getAllCompletedReviews = () => [review];
  const score = modules.risk.getRiskIndex(true).scores.get(source.manuscript_id);
  assert.equal(score.totalScore, 0);
  assert.equal(score.signals.find((s) => s.key === "textSimilarity").applicable, false);
  assert.equal(score.signals.find((s) => s.key === "editorConcentration").applicable, false);
  for (const signal of score.signals.filter((s) => s.applicable)) {
    assert.match(signal.evidence, /\d/);
    assert.match(signal.evidence, /threshold/);
  }
  assert.equal(score.applicableMaxPoints, 65);
});

test("cutoffs remain config defaults; sub-signal weights preserve the specified totals", () => {
  const { thresholds } = modules.risk.getRiskIndex(true);
  assert.equal(thresholds.highCutoff, modules.config.RISK_LEVEL_CUTOFFS.high);
  assert.equal(thresholds.mediumCutoff, modules.config.RISK_LEVEL_CUTOFFS.medium);
  for (const [key, weights] of Object.entries(modules.config.RISK_SUB_SIGNAL_POINTS)) {
    assert.equal(Object.values(weights).reduce((sum, points) => sum + points, 0), modules.config.RISK_SIGNAL_MAX_POINTS[key]);
  }
});

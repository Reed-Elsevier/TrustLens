#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { FIXTURE_PATH } from "./fixtures/fixture-db.mjs";
import { loadPublishingModules } from "./fixtures/load-publishing.mjs";

const SIGNAL_MAXIMA = { textSimilarity: 25, fastTrackAcceptance: 20, reviewerRing: 25, editorConcentration: 10, reviewBehaviour: 20 };
const LEVELS = ["high", "medium", "low"];
const results = [];

function object(value) {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), "Expected an object");
  return value;
}

function fields(value, keys) {
  object(value);
  for (const key of keys) assert.ok(Object.hasOwn(value, key), `Missing field: ${key}`);
}

function number(value) {
  assert.ok(typeof value === "number" && Number.isFinite(value), "Expected a finite number");
}

function nullableNumbers(value, keys) {
  fields(value, keys);
  for (const key of keys) if (value[key] !== null) number(value[key]);
}

function nullableStrings(value, keys) {
  fields(value, keys);
  for (const key of keys) assert.ok(value[key] === null || typeof value[key] === "string", `Invalid string field: ${key}`);
}

function strings(value) {
  assert.ok(Array.isArray(value) && value.every((item) => typeof item === "string"), "Expected a string array");
}

function person(value) {
  object(value);
  assert.equal(typeof value.authorId, "string");
  nullableStrings(value, ["fullName", "country", "institutionName", "researchTier"]);
  nullableNumbers(value, ["hIndex"]);
}

function pair(value) {
  fields(value, ["a", "b", "a_reviews_b", "b_reviews_a", "totalReciprocalReviews", "positivity", "authors", "manuscripts"]);
  assert.equal(typeof value.a, "string");
  assert.equal(typeof value.b, "string");
  for (const key of ["a_reviews_b", "b_reviews_a", "totalReciprocalReviews"]) number(value[key]);
  nullableNumbers(value, ["avgReviewDays", "speedRatio", "avgWordCount", "avgQualityScore"]);
  nullableNumbers(value.positivity, ["pairShare", "globalShare"]);
  fields(value.authors, ["a", "b"]);
  person(value.authors.a);
  person(value.authors.b);
  assert.ok(Array.isArray(value.manuscripts));
  assert.ok(value.manuscripts.length > 0);
  for (const ref of value.manuscripts) {
    fields(ref, ["manuscript_id", "direction"]);
    assert.match(ref.manuscript_id, /^MS\d{8}$/);
    assert.ok(["a_reviews_b", "b_reviews_a"].includes(ref.direction));
  }
}

function list(value) {
  fields(value, ["meta", "items"]);
  fields(value.meta, ["total", "limit", "offset", "thresholds"]);
  for (const key of ["total", "limit", "offset"]) number(value.meta[key]);
  const thresholds = value.meta.thresholds;
  nullableNumbers(thresholds, ["simP75", "simP95", "acceptedTurnaroundP10", "reviewDaysP10", "wordCountP10", "qualityScoreP10"]);
  fields(thresholds, ["includeZeroRevisionSubSignal", "acceptedZeroRevisionShare", "editorAuthorThreshold", "highCutoff", "mediumCutoff"]);
  assert.equal(typeof thresholds.includeZeroRevisionSubSignal, "boolean");
  for (const key of ["acceptedZeroRevisionShare", "editorAuthorThreshold", "highCutoff", "mediumCutoff"]) number(thresholds[key]);
  assert.ok(Array.isArray(value.items));
  for (const item of value.items) {
    fields(item, ["manuscriptId", "totalScore", "level", "topSignals", "hasExistingFlag", "flagStatuses"]);
    assert.match(item.manuscriptId, /^MS\d{8}$/);
    number(item.totalScore);
    assert.ok(LEVELS.includes(item.level));
    strings(item.topSignals);
    assert.equal(item.topSignals.length, 3);
    assert.equal(typeof item.hasExistingFlag, "boolean");
    strings(item.flagStatuses);
    nullableStrings(item, ["journalId", "subjectArea", "topic", "finalDecision"]);
  }
}

function detail(value) {
  fields(value, ["manuscript", "correspondingAuthor", "handlingEditor", "totalScore", "level", "breakdownSum", "applicableMaxPoints", "signals", "reviews", "ringPartners", "publishedPaper", "existingFlags"]);
  assert.match(value.manuscript.manuscriptId, /^MS\d{8}$/);
  nullableStrings(value.manuscript, ["journalId", "articleType", "subjectArea", "topic", "submittedAt", "firstDecisionAt", "finalDecisionAt", "finalDecision"]);
  nullableNumbers(value.manuscript, ["revisionRounds", "turnaroundDays", "similarityScorePct"]);
  for (const key of ["correspondingAuthor", "handlingEditor"]) if (value[key] !== null) person(value[key]);
  for (const key of ["totalScore", "breakdownSum", "applicableMaxPoints"]) number(value[key]);
  assert.ok(LEVELS.includes(value.level));
  for (const key of ["signals", "reviews", "ringPartners", "existingFlags"]) assert.ok(Array.isArray(value[key]), `Missing array: ${key}`);
  assert.equal(value.signals.length, 5);
  assert.deepEqual(new Set(value.signals.map((signal) => signal.key)), new Set(Object.keys(SIGNAL_MAXIMA)));
  for (const signal of value.signals) {
    fields(signal, ["key", "label", "points", "maxPoints", "applicable", "evidence"]);
    assert.equal(typeof signal.label, "string");
    assert.equal(typeof signal.evidence, "string");
    assert.equal(typeof signal.applicable, "boolean");
    number(signal.points);
    assert.equal(signal.maxPoints, SIGNAL_MAXIMA[signal.key]);
    assert.ok(signal.points >= 0 && signal.points <= signal.maxPoints);
    if (!signal.applicable) assert.equal(signal.points, 0);
    else assert.ok(/\d/.test(signal.evidence) && /threshold|p75/i.test(signal.evidence), "Evidence must contain observed numbers and a threshold");
  }
  for (const review of value.reviews) {
    fields(review, ["reviewerAuthorId"]);
    assert.equal(typeof review.reviewerAuthorId, "string");
    nullableNumbers(review, ["reviewDays", "wordCount", "qualityScore"]);
    nullableStrings(review, ["recommendation"]);
  }
  value.ringPartners.forEach(pair);
  if (value.publishedPaper !== null) {
    assert.equal(typeof value.publishedPaper.paperId, "string");
    nullableStrings(value.publishedPaper, ["title", "topic"]);
    nullableNumbers(value.publishedPaper, ["citationCount"]);
  }
  for (const flag of value.existingFlags) {
    assert.equal(typeof flag.flagId, "string");
    nullableStrings(flag, ["flagType", "status", "detectedBy", "evidenceSummary"]);
  }
}

function explanation(value) {
  fields(value, ["manuscriptId", "totalScore", "level", "explanation", "source", "model", "evidenceUsed"]);
  assert.match(value.manuscriptId, /^MS\d{8}$/);
  number(value.totalScore);
  assert.ok(LEVELS.includes(value.level));
  assert.ok(["claude", "fallback"].includes(value.source));
  assert.equal(typeof value.model, "string");
  object(value.evidenceUsed);
  const e = value.explanation;
  fields(e, ["summary", "keyFindings", "caveats", "suggestedNextSteps"]);
  assert.equal(typeof e.summary, "string");
  assert.ok(e.summary.trim() === "" || e.summary.trim().split(/\s+/).length <= 60);
  assert.ok(Array.isArray(e.keyFindings));
  for (const finding of e.keyFindings) {
    fields(finding, ["signal", "evidence", "whyItMatters"]);
    for (const key of ["signal", "evidence", "whyItMatters"]) assert.equal(typeof finding[key], "string");
  }
  strings(e.caveats);
  strings(e.suggestedNextSteps);
}

async function response(handler, request, status, context) {
  const res = await handler(request, context);
  assert.equal(res.status, status, "Wrong response status");
  const body = await res.json();
  object(body);
  return body;
}

function request(endpoint, body) {
  return new Request(`http://fixture.local/api/publishing/${endpoint}`, body === undefined ? undefined : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

async function check(name, run) {
  try {
    await run();
    results.push(true);
    console.log(`PASS - ${name}`);
  } catch {
    results.push(false);
    console.error(`FAIL - ${name} (status, shape or assertion failed; no response contents logged)`);
  }
}

function error(body, code) {
  fields(body, ["error"]);
  fields(body.error, ["code", "message"]);
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, "string");
}

async function wrongTokenCheck(db, modules) {
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    assert.ok(headers.get("x-api-key") === process.env.AWS_BEARER_TOKEN_BEDROCK, "SDK must use the deliberately wrong test credential");
    return new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "Invalid test credential" } }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  };
  const id = db.prepare("SELECT manuscript_id FROM manuscripts ORDER BY manuscript_id LIMIT 1").get()?.manuscript_id;
  assert.ok(id, "Fixture must contain a manuscript");
  const body = await response(modules.explainRoute.POST, request("explain", { manuscriptId: id }), 200);
  explanation(body);
  assert.equal(body.source, "fallback");
  assert.equal(calls, 1, "Authentication errors must not be retried");
  console.log("PASS - isolated wrong-token fallback (local 401 stub, no Bedrock traffic)");
}

async function main() {
  const isolated = process.argv.includes("--wrong-token-check");
  delete process.env.ANTHROPIC_LOG;
  process.env.AWS_REGION = "us-east-1";
  if (isolated) process.env.AWS_BEARER_TOKEN_BEDROCK = "deliberately-invalid-test-credential";
  else delete process.env.AWS_BEARER_TOKEN_BEDROCK;
  globalThis.fetch = async () => { throw new Error("Live network calls are forbidden during fixture verification"); };
  const db = new Database(FIXTURE_PATH, { readonly: true, fileMustExist: true });
  db.pragma("query_only = true");
  globalThis.__trustlensDb = db;
  try {
    const modules = loadPublishingModules();
    if (isolated) {
      await wrongTokenCheck(db, modules);
      return;
    }
    const ids = db.prepare("SELECT manuscript_id FROM manuscripts ORDER BY manuscript_id").all().map((row) => row.manuscript_id);
    assert.ok(ids.length > 0, "Seed the test fixture before verification");
    const expectedPairCount = db.prepare(`
      WITH d AS (
        SELECT r.reviewer_author_id AS a, m.corresponding_author_id AS b, COUNT(*) AS n
        FROM peer_review_assignments r JOIN manuscripts m ON m.manuscript_id = r.manuscript_id
        WHERE r.review_submitted_at IS NOT NULL AND r.reviewer_author_id != m.corresponding_author_id
        GROUP BY a, b
      )
      SELECT COUNT(*) AS count FROM d x JOIN d y ON x.a = y.b AND x.b = y.a WHERE x.a < x.b
    `).get().count;

    async function ringResponse() {
      const body = await response(modules.ringsRoute.GET, request("rings?minEach=1&limit=200"), 200);
      fields(body, ["meta", "pairs"]);
      fields(body.meta, ["minEach", "pairCount", "global"]);
      assert.equal(body.meta.minEach, 1);
      assert.equal(body.meta.pairCount, expectedPairCount);
      nullableNumbers(body.meta.global, ["avgReviewDays", "medianReviewDays", "positiveShare", "avgWordCount", "avgQualityScore"]);
      assert.ok(Array.isArray(body.pairs));
      assert.equal(body.pairs.length, Math.min(expectedPairCount, 200));
      body.pairs.forEach(pair);
      return body;
    }

    await check("1. Ring symmetry: independent SQL recount for five random pairs", async () => {
      const body = await ringResponse();
      const sample = [...body.pairs];
      for (let i = sample.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sample[i], sample[j]] = [sample[j], sample[i]];
      }
      const count = db.prepare(`SELECT COUNT(*) AS count FROM peer_review_assignments r
        JOIN manuscripts m ON m.manuscript_id = r.manuscript_id
        WHERE r.review_submitted_at IS NOT NULL AND r.reviewer_author_id = ? AND m.corresponding_author_id = ?`);
      for (const p of sample.slice(0, 5)) {
        assert.equal(p.a_reviews_b, count.get(p.a, p.b).count);
        assert.equal(p.b_reviews_a, count.get(p.b, p.a).count);
        assert.equal(p.totalReciprocalReviews, p.a_reviews_b + p.b_reviews_a);
      }
    });

    await check("2. No self-pairs, ordered unique pairs and valid ring queries", async () => {
      const body = await ringResponse();
      const seen = new Set();
      for (const p of body.pairs) {
        assert.ok(p.a < p.b);
        const key = JSON.stringify([p.a, p.b]);
        assert.ok(!seen.has(key));
        seen.add(key);
      }
      for (const query of ["minEach=0", "minEach=11", "limit=201", "sort=invalid", "depth=3"]) {
        error(await response(modules.ringsRoute.GET, request(`rings?${query}`), 400), "BAD_REQUEST");
      }
    });

    await check(`3. Every manuscript: independent signal sums, range and detail shape (${ids.length} IDs)`, async () => {
      for (const id of ids) {
        const body = await response(modules.detailRoute.GET, request(`risk/${id}`), 200, { params: Promise.resolve({ manuscriptId: id }) });
        detail(body);
        assert.equal(body.manuscript.manuscriptId, id);
        const sum = Math.round(body.signals.reduce((total, signal) => total + signal.points, 0) * 100) / 100;
        assert.equal(sum, body.totalScore);
        assert.equal(sum, body.breakdownSum);
        assert.ok(sum >= 0 && sum <= 100);
        assert.equal(body.applicableMaxPoints, body.signals.filter((signal) => signal.applicable).reduce((total, signal) => total + signal.maxPoints, 0));
        const reviewers = new Set(db.prepare("SELECT reviewer_author_id FROM peer_review_assignments WHERE manuscript_id = ? AND review_submitted_at IS NOT NULL").all(id).map((row) => row.reviewer_author_id));
        for (const partner of body.ringPartners) {
          assert.ok(partner.a === body.correspondingAuthor?.authorId || partner.b === body.correspondingAuthor?.authorId);
          assert.ok(reviewers.has(partner.a === body.correspondingAuthor.authorId ? partner.b : partner.a));
        }
      }
    });

    await check("4. Top-five/random details, invalid ID/body 400 and unknown ID 404", async () => {
      const body = await response(modules.riskRoute.GET, request("risk?limit=5"), 200);
      list(body);
      assert.equal(body.items.length, Math.min(5, ids.length));
      const sample = [...body.items.map((item) => item.manuscriptId), ids[Math.floor(Math.random() * ids.length)]];
      for (const id of sample) detail(await response(modules.detailRoute.GET, request(`risk/${id}`), 200, { params: Promise.resolve({ manuscriptId: id }) }));
      const knownIds = new Set(ids);
      let fakeNumber = 99999999;
      while (knownIds.has(`MS${String(fakeNumber).padStart(8, "0")}`)) fakeNumber--;
      const fakeId = `MS${String(fakeNumber).padStart(8, "0")}`;
      for (const [id, status, code] of [["invalid", 400, "BAD_REQUEST"], [fakeId, 404, "NOT_FOUND"]]) {
        error(await response(modules.detailRoute.GET, request(`risk/${id}`), status, { params: Promise.resolve({ manuscriptId: id }) }), code);
        error(await response(modules.explainRoute.POST, request("explain", { manuscriptId: id }), status), code);
      }
      error(await response(modules.explainRoute.POST, request("explain", {}), 400), "BAD_REQUEST");
    });

    await check("5. Explanation shape and isolated deliberately wrong-token fallback", async () => {
      const body = await response(modules.explainRoute.POST, request("explain", { manuscriptId: ids[0] }), 200);
      explanation(body);
      assert.equal(body.source, "fallback");
      const repeated = await response(modules.explainRoute.POST, request("explain", { manuscriptId: ids[0] }), 200);
      assert.deepEqual(repeated, body);
      const env = { ...process.env };
      delete env.AWS_BEARER_TOKEN_BEDROCK;
      const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--wrong-token-check"], { env, stdio: "pipe", timeout: 30_000 });
      assert.equal(child.status, 0, "Isolated wrong-token check failed");
    });

    await check("6. Scored manuscript count, complete pagination, ranking and top signals", async () => {
      const all = [];
      let offset = 0;
      do {
        const body = await response(modules.riskRoute.GET, request(`risk?limit=200&offset=${offset}${offset === 0 ? "&refresh=1" : ""}`), 200);
        list(body);
        assert.equal(body.meta.total, db.prepare("SELECT COUNT(*) AS count FROM manuscripts").get().count);
        assert.equal(body.meta.offset, offset);
        assert.equal(body.meta.limit, 200);
        assert.equal(body.items.length, Math.min(200, ids.length - offset));
        all.push(...body.items);
        offset += body.items.length;
      } while (offset < ids.length);
      assert.deepEqual(new Set(all.map((item) => item.manuscriptId)), new Set(ids));
      for (let i = 0; i < all.length; i++) {
        if (i > 0) {
          assert.ok(all[i - 1].totalScore >= all[i].totalScore);
          if (all[i - 1].totalScore === all[i].totalScore) assert.ok(all[i - 1].manuscriptId < all[i].manuscriptId);
        }
        const score = modules.risk.getRiskIndex().scores.get(all[i].manuscriptId);
        assert.equal(all[i].totalScore, score.totalScore);
        assert.deepEqual(all[i].topSignals, [...score.signals].sort((a, b) => b.points - a.points).slice(0, 3).map((signal) => signal.key));
      }
    });
    console.log(`${results.filter(Boolean).length}/${results.length} checks passed.`);
    if (results.some((passed) => !passed)) process.exitCode = 1;
  } finally {
    delete globalThis.__trustlensDb;
    db.close();
  }
}

main().catch(() => {
  console.error("FAIL - verification could not complete; seed data/test-fixture.db and check the installed dependencies.");
  process.exitCode = 1;
});

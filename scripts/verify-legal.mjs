#!/usr/bin/env node
// Manual fallback check: restart the dev server with a wrong Claude credential, call
// /api/legal/good-law?docId=<overruled ID>&explain=1, and expect HTTP 200/source "fallback".
// Restart to clear any cached Claude answer before checking; never log credentials.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const results = [];

async function get(endpoint, status = 200) {
  const response = await fetch(new URL(`/api/legal/${endpoint}`, BASE_URL), { signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, status, "Wrong response status");
  return response.json();
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

async function main() {
  const truth = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".generated", "legal-truth.json"), "utf8"));
  await check("All planted overrulings, questionable cases and superseded documents", async () => {
    for (const [ids, verdict] of [[truth.overruledIds, "overruled"], [truth.questionableIds, "questionable"], [truth.supersededIds, "superseded"]]) {
      for (const id of ids) {
        const result = await get(`good-law?docId=${encodeURIComponent(id)}&explain=0`);
        assert.equal(result.finalVerdict, verdict);
        assert.equal(result.source, "rules");
        assert.equal(result.explanation, null);
        if (truth.staleStatusOverruledIds.includes(id)) assert.equal(result.statusMismatch, true);
      }
    }
  });
  await check("Deadline ranking, low-sample exclusion and totals", async () => {
    const result = await get("deadlines?minSample=20&summary=0");
    assert.deepEqual(new Set(result.ranked.slice(0, 3).map((row) => row.jurisdiction)), new Set(truth.lateJurisdictions));
    assert.ok(result.lowSample.some((row) => row.jurisdiction === truth.tinyJurisdiction));
    const all = [...result.ranked, ...result.lowSample];
    assert.equal(result.overall.total, 400);
    assert.equal(result.overall.total, all.reduce((sum, row) => sum + row.total, 0));
    assert.equal(result.overall.misses, all.reduce((sum, row) => sum + row.misses, 0));
    assert.equal(result.overall.missRate, result.overall.misses / all.reduce((sum, row) => sum + row.resolved, 0));
    assert.equal(result.meta.warnings.length, 0);
  });
  await check("Pilot speed/quality trade-off and composition caveat", async () => {
    const result = await get("pilot?summary=0");
    assert.equal(result.verdict, "faster_but_worse");
    assert.equal(result.mixWarning, true);
    for (const row of result.byDocType) {
      assert.ok(row.auto.speed.median < row.manual.speed.median);
      assert.ok(row.auto.accuracy < row.manual.accuracy);
    }
  });
  await check("Invalid doc ID is 400; unknown doc ID is 404", async () => {
    assert.equal((await get("good-law?docId=abc", 400)).error.code, "BAD_REQUEST");
    assert.equal((await get("good-law?docId=LD99999", 404)).error.code, "NOT_FOUND");
  });
  await check("Live Claude explanation agrees with an overruled rule verdict", async () => {
    const result = await get(`good-law?docId=${encodeURIComponent(truth.overruledIds[0])}&explain=1`);
    assert.equal(result.source, "claude");
    assert.equal(result.disagreement, false);
    assert.equal(result.finalVerdict, "overruled");
    assert.equal(result.explanation.verdict, "overruled");
  });
  console.log(`${results.filter(Boolean).length}/${results.length} checks passed.`);
  if (results.some((passed) => !passed)) process.exitCode = 1;
}

main().catch(() => {
  console.error("FAIL - verification could not start; run legal:seed and start the dev server.");
  console.log("0/1 checks passed.");
  process.exitCode = 1;
});

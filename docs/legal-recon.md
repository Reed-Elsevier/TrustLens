# Legal Research Assistant: reconnaissance

## Plan and assumptions (no feature work yet)
- Created and switched from `main` to `feature/legal-ai`; this report is the only new file.
- Later, after approval: inspect legal CSV schemas/treatment labels and pilot groups; agree additive import/fixture changes; implement B2, B1, B3, then grounded AI and UI; validate isolated fixtures, lint/type-check/build.
- Assume analytics remain read-only and legal numbers/verdict inputs come from SQL/code, not Claude. No legal schema, inference policy, or pilot comparison is assumed validated.
- Inspection only: no build, tests, seeding/resetting, or Bedrock/network requests; database inspected read-only.

## 1. Applicable rules
- [AGENTS.md](../AGENTS.md): read relevant installed Next.js guides before code; heed breaking changes/deprecations; generated instruction blocks are restored by `next dev`. Retain anonymized meaningful Next.js feedback and report qualifying candidates before finishing; none arose here.
- It specifies no general formatting convention or test runner. Existing code uses TypeScript, double quotes, semicolons, two-space indentation; [tsconfig.json](../tsconfig.json) enables `strict`.
- [SPEC.md](../SPEC.md): feature folders; routes only parse/delegate/respond, services analyze, repositories hold SQL, pages only render; share helpers in `lib/` only when two features need them.
- SQL/code supplies numbers; AI explains/routes/summarizes and must show supporting rows/numbers. Raw CSVs untouched; raw SQL via better-sqlite3, no ORM; production analytics read-only.
- Forbidden/out of scope: analysis-data writes, free-form text-to-SQL, signup/roles, real-time ingestion, mobile layout. Auth design: Credentials demo user from env, protected pages.
- Validation/DoD: six real data-backed answers deployed on AWS, working login, grounded assistant for both modules, deployed end-to-end flow testing; no prescribed unit-test command.
- Spec is a target, not current layout: it describes `src/features`, `data/app.db`, undecided AI provider/`ask()`, and NextAuth; actual inspected code uses root `app/`, `lib/publishing`, `hackathon.db`, and Bedrock.

## 2. Claude client
- [lib/claude.ts](../lib/claude.ts) exports exactly:
  - `DEFAULT_CLAUDE_MODEL = "anthropic.claude-sonnet-5"` (constant).
  - `getClaudeModel(): string`.
  - `getClaudeClient(): Anthropic`.
- Uses `@anthropic-ai/sdk`'s Anthropic client, lazily cached in module scope, with `apiKey: process.env.AWS_BEARER_TOKEN_BEDROCK` and `baseURL: https://bedrock-mantle.${region}.api.aws/anthropic`.
- Required `AWS_REGION` and `AWS_BEARER_TOKEN_BEDROCK` each throw if missing; `CLAUDE_MODEL ?? DEFAULT_CLAUDE_MODEL` selects model. Credentials are server-only, not logged.
- Wrapper does not call messages or set timeout/retries; callers use `client.messages.create(...)`. [scripts/test-bedrock.mjs](../scripts/test-bedrock.mjs) is a live 64-token "Say hi" smoke test using the same endpoint/env/model, with no explicit timeout.
- Publishing explanation caller: 800 tokens, one shared 20,000ms deadline/AbortController across attempts, remaining deadline passed as SDK timeout, SDK `maxRetries: 0`; one retry only for invalid JSON/shape/>60-word summary, not network/auth/timeout failures.

## 3. Database and SQL guard
- [lib/db.ts](../lib/db.ts) exports `db: Database.Database`; path is `path.join(process.cwd(), "hackathon.db")`, not `data/app.db`.
- Lazy Proxy opens `new Database(DB_PATH, { readonly: true, fileMustExist: true })`, sets `query_only = true`, binds methods, caches connection in `globalThis.__trustlensDb` across hot reload.
- No env/setting switches DB paths. Tests open `data/test-fixture.db` read-only and inject `globalThis.__trustlensDb` before loading routes.
- [lib/sql-guard.ts](../lib/sql-guard.ts) exports only `assertSafeIdentifier(value: string, allowed: readonly string[]): string`; checks allowlist, throws otherwise. Values still require prepared-statement parameters.

## 4. Publishing conventions
- [http.ts](../lib/publishing/http.ts): errors `{ error: { code, message } }`; 400 `BAD_REQUEST`, 404 `NOT_FOUND`, 500 `INTERNAL` (default "Internal server error"). `withApiRequest` preserves Next control-flow errors via `unstable_rethrow`, logs sanitized unexpected failures, logs duration in `finally`.
- [config.ts](../lib/publishing/config.ts): centralized typed ranges/sorts, weights/cutoffs, positive recommendations (`Accept`, `Minor Revision`), explanation budget/retry settings; data percentile thresholds computed rather than hardcoded.
- [stats.ts](../lib/publishing/stats.ts): pure percentile interpolation/summarize/mean/clamp helpers; empty distributions/mean yield null; sorts a copied array and filters null/NaN.
- [prompts.ts](../lib/publishing/prompts.ts): `EXPLAIN_SYSTEM_PROMPT` demands evidence-only JSON, <=60-word summary, findings/caveats/next steps; packet text is data, not instructions; suspicion never proof.
- [risk route](../app/api/publishing/risk/route.ts): `GET(NextRequest)` inside `withApiRequest`, explicit Number/integer/range checks and enum/boolean checks, early 400; `limit` 1..500, nonnegative `offset`; `minScore` only rejects NaN (not infinity).
- Success `{ meta: { total, limit, offset, thresholds }, items }`; uses `NextResponse.json`; route/library imports use `@/lib/...`, with `@/*` mapped to `./*`.
- No `runtime` or `dynamic` exports: [rings route](../app/api/publishing/rings/route.ts) explains `cacheComponents: true` means uncached GET/Node-only and legacy segment config is rejected; [next.config.ts](../next.config.ts) enables this.
- In-process caching: global risk index, module-local ring reviews/stats; `refresh=1` rebuilds risk and resets rings. [explain.ts](../lib/publishing/explain.ts) caches successful Claude results by manuscript ID, without TTL.
- Claude failures log sanitized notice and return deterministic evidence-based `source: "fallback"` with model/evidence/caveats, not cached; valid output is `source: "claude"`. Evidence uses IDs instead of personal names.

## 5. Fixture scripts and verification
- [fixture-db.mjs](../scripts/fixtures/fixture-db.mjs): fixes target to `data/test-fixture.db`; rejects hackathon/alternate paths, linked directory/file/hardlinks, and existing tables with >100 rows.
- [seed-hackathon-db.mjs](../scripts/fixtures/seed-hackathon-db.mjs): guards target/no override args, deletes the entire existing fixture file, recreates seven publishing tables, seeds 15 manuscripts plus ring/similarity/fast-track/editor/control scenarios.
- [reset-hackathon-db.mjs](../scripts/fixtures/reset-hackathon-db.mjs): guards same target; DELETEs ALL rows from ALL non-`sqlite_%` fixture tables (not publishing-only), preserves schema/file, then VACUUMs; absent file is a no-op.
- Neither runs `DROP TABLE`: reset drops no tables; seed removes the WHOLE fixture DB, effectively losing ALL tables (including future legal ones), then recreates publishing-only. Neither targets root `hackathon.db`.
- [load-publishing.mjs](../scripts/fixtures/load-publishing.mjs): temporarily hooks CommonJS `.ts` loading with existing TypeScript transpilation and resolves `@/`; loads routes/libs, restores hooks; not a type-check.
- [publishing.test.mjs](../scripts/fixtures/publishing.test.mjs): `node:test` + strict assert; opens pre-seeded fixture, injects DB, mocks Claude/timers/queries; tests guards, shapes, rings, timeouts/retries/fallback/cache, sanitized errors, refresh and scoring.
- [verify-publishing.mjs](../scripts/verify-publishing.mjs): standalone strict-assert PASS/FAIL runner (not node:test); six checks for independent SQL counts, all-manuscript scores/shapes, validation, fallback and pagination; local 401 child-process stub, live fetch forbidden.
- Tests/verifier do not build/seed their DB. Intended sequence: `node scripts/fixtures/seed-hackathon-db.mjs`, then `node --test scripts/fixtures/publishing.test.mjs` and `node scripts/verify-publishing.mjs`; not executed in this task.

## 6. Package and ignored files
- [package.json](../package.json) scripts: `dev: next dev`, `build: next build`, `start: next start`, `lint: eslint`; NO `test` script. Direct test command above uses Node's built-in runner.
- Dependencies: `@anthropic-ai/sdk ^0.132.1`, `better-sqlite3 ^13.0.3`, `next 16.4.0`, `react 19.3.0`, `react-dom 19.3.0`.
- Dev dependencies: `@tailwindcss/turbopack ^4`, `@types/better-sqlite3 ^9.6.0`, `@types/node ^20`, `@types/react ^19`, `@types/react-dom ^19`, `eslint ^9`, `eslint-config-next 16.4.0`, `tailwindcss ^4`, `typescript ^5`; allowScripts permits `unrs-resolver@1.12.2`.
- [ .gitignore](../.gitignore) has no explicit rule for `hackathon.db` or `.generated/`; `hackathon.db` is tracked. It ignores dependencies/build output/env files except `.env.example`; no fixture DB rule either.

## 7. Actual database tables
- Read-only query: `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`.
- [hackathon.db](../hackathon.db): `authors`, `citations`, `institutions`, `manuscripts`, `peer_review_assignments`, `research_integrity_flags`, `research_papers_published`. No legal tables currently exist.

## Things that look risky for adding legal tables
- Existing analytics handle cannot create/write tables; legal import needs a separately agreed offline, additive write path. Root DB is tracked; never overwrite it with fixture scripts.
- Seed destroys every fixture table; reset empties every user table. Publishing-only seed cannot test legal queries, and adding legal fixture data can be wiped by either script.
- Global DB injection and indefinite ID-keyed caches need explicit isolation/invalidation when datasets change; risk refresh does not clear explanation cache.
- Resolve spec/current-layout/provider discrepancies before implementation; legal treatment labels, deadline timestamps/jurisdictions and pilot cohorts remain unverified. Do not invent verdicts or causal improvements.

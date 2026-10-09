# Publishing discovery status

## Blocked on real data

Step 0 discovery has not been performed. The current root database is a
synthetic fixture, not the publishing dataset. No fixture measurements are
presented here as discovery results.

After real data is imported, complete every Step 0 item in
[SPEC-publishing.md](./SPEC-publishing.md): table schemas/counts, distinct value
counts, distributions, accepted zero-revision share, join integrity,
self-reviews and mutual-pair counts. Confirm the positive recommendation
mapping against those values.

Risk level recalibration is also blocked on real data. The starting cutoffs
remain high >= 50 and medium >= 25 in config; they are not calibrated against
the synthetic fixture. Signal percentiles are still computed from whichever
database is loaded at warm-up, as required by the scoring rules.

## Fixture isolation and verification

The seed/reset utilities live in `scripts/fixtures/` and target only
`data/test-fixture.db`. They reject `hackathon.db`, alternative targets,
linked files/directories, and an existing database with more than 100 rows in
any table. They do not migrate, read or overwrite the root database.

The existing `lib/db.ts` does **not** support `DATABASE_PATH`: application
routes still open the root database read-only. This helper is outside the
authorized edit scope and has not been changed. Before real-data import,
remove the legacy fixture from the production filename through a separately
authorized migration; do not copy the test fixture back to that filename.

Run fixture-only verification:

```sh
node scripts/fixtures/seed-hackathon-db.mjs
node scripts/verify-publishing.mjs
node --test scripts/fixtures/publishing.test.mjs
```

Verification directly invokes the real route handlers using the installed
TypeScript compiler. It installs a read-only fixture connection in the
database helper's existing global connection slot, without changing the
helper or setting `DATABASE_PATH`. This tests handler contracts, not Next.js
HTTP routing or deployment middleware. Every manuscript is checked, with
independent SQL ring recounts and independent sums of signal points.

The wrong-token check runs in a separate process with a deliberately invalid
test credential. A local fetch stub verifies that the SDK supplies that
credential and returns HTTP 401; no credential is printed and no Bedrock
request is sent. The response must have `source: "fallback"`. Live Bedrock
access still needs a separately authorized smoke test.

## Deviations from spec

- No `runtime` or `dynamic` route exports are added. This project enables
  Next.js Cache Components, which rejects those legacy segment options.
  The production build confirms the publishing routes are dynamic and use
  the supported Node.js runtime.
- Unexpected errors use `{ error: { code: "INTERNAL", message } }`, as
  requested in the review fixes, with a sanitized message. The shared
  wrapper rethrows Next.js control-flow exceptions so Cache Components can
  still detect request-time APIs during the build.
- Three-cycle support is removed pending real-data discovery. The `depth`
  query parameter is rejected rather than silently returning a different
  response shape.
- Step 0 and final risk cutoff calibration are deferred until real data is
  available; this document is a status report, not completed discovery.

## Authentication

No middleware/proxy matcher, session helper or other API routes protecting
the publishing routes exists in the current repository. Authentication has
not been implemented in this change. The smallest follow-up is to add a
shared server-side session check for all publishing handlers (or include
`/api/publishing/:path*` in the application's authenticated middleware when
one exists), then authorize access to manuscript integrity evidence.

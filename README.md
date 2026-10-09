This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment Variables

Copy [`.env.example`](.env.example) to `.env.local` and fill in real values:

```bash
cp .env.example .env.local
```

`.env.local` is git-ignored, so it's safe to put real secrets there; never put
real secrets in `.env.example`. Next.js only reads env files at process
startup, so restart `npm run dev` (or re-run `npm run build`) any time you
add or change a variable in `.env.local`.

## Paper analyzer (drag & drop)

The home page (`/`) lets you drop a research PDF and get a publishing-integrity
screen, a legal good-law check of the authorities it cites, an AI-written list of
what the paper lacks and needs, and a chat grounded in those results.

```bash
npm run legal:seed     # one-off: writes the synthetic legal tables into hackathon.db
npm run dev            # then open http://localhost:3000 and drop a PDF, or click "Try a sample paper"
npm run test:analyze   # analyzer tests (temporary database, no network)
npm run sample:paper   # regenerates public/sample-paper.pdf (matches the seeded legal data)
```

- Without legal tables the legal check still runs but cannot verify authorities; the UI says so.
- AI processing is **off by default**. Opt in using the privacy checkbox to let
  Claude (AWS Bedrock) write the review and chat answers. Without a valid
  `AWS_BEARER_TOKEN_BEDROCK` (the short-term key expires in about 12 hours) both fall
  back to deterministic answers built from the computed checks, so the page keeps working.
- PDFs are parsed in server memory and never saved by the app. Extracts are sent
  to the model only with explicit opt-in.
- API: `POST /api/analyze` (multipart `file`), `POST /api/analyze/review`,
  `POST /api/analyze/chat`, `DELETE /api/analyze`.

### Data privacy and usage policy

- Read `/privacy` for the current demo's processing, retention, provider and
  deletion limitations. This is not a claim of regulatory compliance.
- Review/chat accept `allowAi: true` only after user consent. Omitted or `false`
  means deterministic answers with `source: "local"` and **no model call**,
  even when an AI review is already cached. Invalid non-boolean values are
  rejected. Consent is not persisted across page sessions.
- Switching AI mode resets the chat and reloads the review in that mode.
  Revocation stops new model requests, not requests already sent.
- Confirming **Delete saved list** deletes its known analysis IDs from the
  current process's cache before deleting browser metadata.
  `DELETE /api/analyze` accepts `{ "analysisIds": ["16-character-hex-id"] }`
  (1–100 IDs per request), returning `deleted` and `alreadyAbsent` arrays.
  New lists retain revision IDs; older lists can delete only still-reachable IDs.
- The cache has a one-hour **idle** expiry and 20-entry limit. Expired entries
  are pruned on cache access, not a guaranteed exact-time physical erasure.
  Deployment logs, replicas and provider processing have separate policies.
- The demo is unauthenticated and browser lists are not account-isolated.
  Do not upload confidential/personal data or secrets. Production use requires
  operator-specific privacy/legal review, authentication, authorization,
  secure deployment and provider agreements.

### Plagiarism screening and revision bucket lists

- The **Plagiarism checker** screens the extracted manuscript body (excluding the
  reference list) against the local published-abstract corpus. It flags runs of at
  least 10 consecutive ASCII-word tokens, ignoring case and punctuation. Expand a match to
  compare manuscript/source excerpts and see the source title, paper ID and DOI.
  The overlap percentage counts each matched manuscript word once; the report
  displays the 20 longest matches, but counts all matches. It does **not** search
  the internet, compare full published papers, detect all paraphrases, or prove
  plagiarism. Quoted/cited overlap needs human review. Missing corpus data and
  truncated PDF text are explicitly disclosed. Existing integrity scoring is
  unchanged.
- Ask the chatbot about a gap or how to fix the paper. Evidence-linked task
  suggestions offer **“Want me to add this to your bucket list?”**; nothing is
  added until you click **Add task**. Duplicate finding-linked tasks are prevented.
  Custom tasks, manual completion, editing and deletion are also supported.
- Use **Upload revised PDF / Re-analyze** in that paper's bucket list after
  editing the PDF externally. This explicitly associates the revision with the
  saved paper and compares against its **last successful analysis**, not an
  unrelated upload. An identical PDF leaves the baseline unchanged. Failed
  uploads preserve the previous report and tasks.
- Tasks show before/after check evidence. Only measurable checks (such as a
  previously missing heading/statement now detected, duplicate-reference counts,
  or reconciled numbered citations) can complete automatically. Detection is not
  proof of content quality. Plagiarism attribution, legal/editorial judgments,
  custom/edited tasks, inapplicable checks, truncated text and substantially
  shortened revisions require human review. Reappearing issues reopen
  automatically completed tasks; manual completion stays explicitly labelled.
- Task metadata and the latest/previous compact check summaries persist in
  `localStorage` for this browser and origin only, under
  `trustlens.bucketlist.v1`. Neither PDFs, full manuscript text nor matched
  excerpts are saved there. Saved lists can be resumed from the home page and
  individually deleted. Limits are 10 papers and 100 tasks per paper; reaching a
  limit never silently deletes older data. Storage failures and malformed saved
  data are surfaced, with confirmation required before clearing invalid data.
  Browser data is not account-isolated; avoid shared browsers for confidential
  task metadata. There is no cross-device synchronization.
- Server-side analysis/chat context remains an in-memory cache with a one-hour
  idle expiry. After refresh or server restart, the saved bucket list can still
  compare a revised upload, but chat requires uploading the paper again.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

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
- Claude (AWS Bedrock) writes the review and chat answers. Without a valid
  `AWS_BEARER_TOKEN_BEDROCK` (the short-term key expires in about 12 hours) both fall
  back to deterministic answers built from the computed checks, so the page keeps working.
- PDFs are parsed in memory and never saved. Extracts of the analysis are sent to the model.
- API: `POST /api/analyze` (multipart `file`), `POST /api/analyze/review`, `POST /api/analyze/chat`.

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

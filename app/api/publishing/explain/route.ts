import { NextRequest, NextResponse } from "next/server";
import { badRequest, withApiRequest, notFound } from "@/lib/publishing/http";
import { explainManuscript } from "@/lib/publishing/explain";

// See app/api/publishing/rings/route.ts for why no runtime/dynamic exports.

const MANUSCRIPT_ID_PATTERN = /^MS\d{8}$/;

export async function POST(request: NextRequest) {
  return withApiRequest("POST /api/publishing/explain", async () => {

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Request body must be valid JSON");
    }

    if (typeof body !== "object" || body === null || typeof (body as Record<string, unknown>).manuscriptId !== "string") {
      return badRequest('Request body must be { "manuscriptId": string }');
    }
    const manuscriptId = (body as { manuscriptId: string }).manuscriptId;
    if (!MANUSCRIPT_ID_PATTERN.test(manuscriptId)) {
      return badRequest("manuscriptId must match /^MS\\d{8}$/");
    }

    const result = await explainManuscript(manuscriptId);
    if (!result) {
      return notFound(`Unknown manuscriptId: ${manuscriptId}`);
    }

    return NextResponse.json(result);
  });
}

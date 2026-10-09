import { NextRequest, NextResponse } from "next/server";
import { badRequest, withApiRequest, notFound } from "@/lib/publishing/http";
import { getManuscriptDetail } from "@/lib/publishing/risk";

// See app/api/publishing/rings/route.ts for why no runtime/dynamic exports.

const MANUSCRIPT_ID_PATTERN = /^MS\d{8}$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ manuscriptId: string }> }) {
  return withApiRequest("GET /api/publishing/risk/[manuscriptId]", async () => {
    const { manuscriptId } = await params;

    if (!MANUSCRIPT_ID_PATTERN.test(manuscriptId)) {
      return badRequest("manuscriptId must match /^MS\\d{8}$/");
    }

    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get("refresh") === "1";

    const detail = getManuscriptDetail(manuscriptId, refresh);
    if (!detail) {
      return notFound(`Unknown manuscriptId: ${manuscriptId}`);
    }

    return NextResponse.json(detail);
  });
}

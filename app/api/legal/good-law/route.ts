import { NextRequest, NextResponse } from "next/server";
import { badRequest, notFound, withApiRequest } from "@/lib/legal/http";
import { ID_PATTERNS } from "@/lib/legal/config";
import { goodLawReport } from "@/lib/legal/goodLaw";

export async function GET(request: NextRequest) {
  return withApiRequest("GET /api/legal/good-law", async () => {
    const params = new URL(request.url).searchParams;
    const docId = params.get("docId") ?? "";
    const explain = params.get("explain") ?? "0";
    if (!ID_PATTERNS.document.test(docId)) return badRequest("docId must match LD followed by five digits");
    if (explain !== "0" && explain !== "1") return badRequest("explain must be 0 or 1");
    const result = await goodLawReport(docId, explain === "1");
    return result ? NextResponse.json(result) : notFound("Legal document not found");
  });
}

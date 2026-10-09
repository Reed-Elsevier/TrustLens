import { NextRequest, NextResponse } from "next/server";
import { badRequest, withApiRequest } from "@/lib/legal/http";
import { DOC_TYPES, SYNTHETIC_NOTICE } from "@/lib/legal/config";
import { searchDocuments } from "@/lib/legal/goodLaw";

export async function GET(request: NextRequest) {
  return withApiRequest("GET /api/legal/documents", () => {
    const params = new URL(request.url).searchParams;
    const raw = params.get("limit") ?? "20";
    const limit = Number(raw);
    const docType = params.get("docType") || undefined;
    if (!/^\d+$/.test(raw) || !Number.isInteger(limit) || limit < 1 || limit > 50) return badRequest("limit must be an integer between 1 and 50");
    if (docType && !DOC_TYPES.some((type) => type === docType)) return badRequest("docType must be case, statute, or regulation");
    const items = searchDocuments(params.get("q") ?? "", docType, params.get("jurisdiction") || undefined, limit);
    return NextResponse.json({ notice: SYNTHETIC_NOTICE, items });
  });
}

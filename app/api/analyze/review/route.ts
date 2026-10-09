import { NextRequest, NextResponse } from "next/server";
import { ANALYSIS_ID_PATTERN } from "@/lib/analyze/config";
import { badRequest, notFound, readJsonObject, withApiRequest } from "@/lib/analyze/http";
import { reviewAnalysis } from "@/lib/analyze/review";

export async function POST(request: NextRequest) {
  return withApiRequest("POST /api/analyze/review", async () => {
    const body = await readJsonObject(request);
    const analysisId = body?.analysisId;
    if (typeof analysisId !== "string" || !ANALYSIS_ID_PATTERN.test(analysisId)) return badRequest("analysisId must be a 16-character hex id");
    if (body?.allowAi !== undefined && typeof body.allowAi !== "boolean") return badRequest("allowAi must be a boolean");
    const result = await reviewAnalysis(analysisId, body?.allowAi === true);
    return result ? NextResponse.json(result) : notFound("Analysis not found or expired. Upload the PDF again.");
  });
}

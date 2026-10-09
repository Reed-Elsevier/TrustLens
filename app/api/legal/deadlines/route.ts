import { NextRequest, NextResponse } from "next/server";
import { badRequest, withApiRequest } from "@/lib/legal/http";
import { MIN_SAMPLE_DEFAULT } from "@/lib/legal/config";
import { deadlineReport } from "@/lib/legal/deadlines";

export async function GET(request: NextRequest) {
  return withApiRequest("GET /api/legal/deadlines", async () => {
    const params = new URL(request.url).searchParams;
    const raw = params.get("minSample") ?? String(MIN_SAMPLE_DEFAULT);
    const minSample = Number(raw);
    const summary = params.get("summary") ?? "0";
    if (!/^\d+$/.test(raw) || !Number.isInteger(minSample) || minSample < 1 || minSample > 200) return badRequest("minSample must be an integer between 1 and 200");
    if (summary !== "0" && summary !== "1") return badRequest("summary must be 0 or 1");
    return NextResponse.json(await deadlineReport(minSample, summary === "1"));
  });
}

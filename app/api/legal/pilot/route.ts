import { NextRequest, NextResponse } from "next/server";
import { badRequest, withApiRequest } from "@/lib/legal/http";
import { pilotReport } from "@/lib/legal/pilot";

export async function GET(request: NextRequest) {
  return withApiRequest("GET /api/legal/pilot", async () => {
    const summary = new URL(request.url).searchParams.get("summary") ?? "0";
    if (summary !== "0" && summary !== "1") return badRequest("summary must be 0 or 1");
    return NextResponse.json(await pilotReport(summary === "1"));
  });
}

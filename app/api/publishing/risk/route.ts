import { NextRequest, NextResponse } from "next/server";
import { badRequest, withApiRequest } from "@/lib/publishing/http";
import { listRisk, type RiskLevel } from "@/lib/publishing/risk";

// See app/api/publishing/rings/route.ts for why no runtime/dynamic exports.

const LEVELS: RiskLevel[] = ["high", "medium", "low"];

export async function GET(request: NextRequest) {
  return withApiRequest("GET /api/publishing/risk", () => {
    const { searchParams } = new URL(request.url);

    const limitRaw = searchParams.get("limit") ?? "50";
    const offsetRaw = searchParams.get("offset") ?? "0";
    const levelRaw = searchParams.get("level");
    const topic = searchParams.get("topic") ?? undefined;
    const subjectArea = searchParams.get("subjectArea") ?? undefined;
    const minScoreRaw = searchParams.get("minScore");
    const flaggedRaw = searchParams.get("flagged");
    const refresh = searchParams.get("refresh") === "1";

    const limit = Number(limitRaw);
    const offset = Number(offsetRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      return badRequest("limit must be an integer between 1 and 500");
    }
    if (!Number.isInteger(offset) || offset < 0) {
      return badRequest("offset must be a non-negative integer");
    }
    if (levelRaw !== null && !LEVELS.includes(levelRaw as RiskLevel)) {
      return badRequest(`level must be one of ${LEVELS.join(", ")}`);
    }
    let minScore: number | undefined;
    if (minScoreRaw !== null) {
      minScore = Number(minScoreRaw);
      if (Number.isNaN(minScore)) return badRequest("minScore must be a number");
    }
    let flagged: boolean | undefined;
    if (flaggedRaw !== null) {
      if (flaggedRaw !== "true" && flaggedRaw !== "false") return badRequest("flagged must be true or false");
      flagged = flaggedRaw === "true";
    }

    const { items, total, thresholds } = listRisk(
      {
        limit,
        offset,
        level: (levelRaw as RiskLevel) ?? undefined,
        topic,
        subjectArea,
        minScore,
        flagged,
      },
      refresh
    );

    return NextResponse.json({
      meta: { total, limit, offset, thresholds },
      items,
    });
  });
}

import { NextRequest, NextResponse } from "next/server";
import { RING_CONFIG, type RingSort } from "@/lib/publishing/config";
import { getRingPairs } from "@/lib/publishing/rings";
import { badRequest, withApiRequest } from "@/lib/publishing/http";

// NOTE: this repo has `cacheComponents: true` in next.config.ts (Next.js 16).
// Under Cache Components, GET route handlers are dynamic (uncached) by
// default and the Node.js runtime is the only supported runtime, so the
// legacy `export const runtime = "nodejs"` / `export const dynamic =
// "force-dynamic"` route segment config is rejected at build time and has
// been omitted here. See docs/publishing-discovery.md for details.

function sortValue(pair: { totalReciprocalReviews: number; speedRatio: number | null; positivity: { pairShare: number | null } }, sort: RingSort): number {
  if (sort === "totalReciprocalReviews") return pair.totalReciprocalReviews;
  if (sort === "speedRatio") return pair.speedRatio ?? -Infinity;
  return pair.positivity.pairShare ?? -Infinity;
}

export async function GET(request: NextRequest) {
  return withApiRequest("GET /api/publishing/rings", () => {
    const { searchParams } = new URL(request.url);

    const minEachRaw = searchParams.get("minEach") ?? String(RING_CONFIG.defaultMinEach);
    const limitRaw = searchParams.get("limit") ?? "50";
    const sortRaw = (searchParams.get("sort") ?? "totalReciprocalReviews") as RingSort;
    const depthRaw = searchParams.get("depth");

    const minEach = Number(minEachRaw);
    const limit = Number(limitRaw);

    if (!Number.isInteger(minEach) || minEach < RING_CONFIG.minEachRange.min || minEach > RING_CONFIG.minEachRange.max) {
      return badRequest(`minEach must be an integer between ${RING_CONFIG.minEachRange.min} and ${RING_CONFIG.minEachRange.max}`);
    }
    if (!Number.isInteger(limit) || limit < RING_CONFIG.limitRange.min || limit > RING_CONFIG.limitRange.max) {
      return badRequest(`limit must be an integer between ${RING_CONFIG.limitRange.min} and ${RING_CONFIG.limitRange.max}`);
    }
    if (!RING_CONFIG.allowedSorts.includes(sortRaw)) {
      return badRequest(`sort must be one of ${RING_CONFIG.allowedSorts.join(", ")}`);
    }
    if (depthRaw !== null) {
      return badRequest("depth is not supported");
    }

    const { pairs, global } = getRingPairs(minEach);
    const sorted = [...pairs].sort((x, y) => sortValue(y, sortRaw) - sortValue(x, sortRaw)).slice(0, limit);

    return NextResponse.json({
      meta: {
        minEach,
        pairCount: pairs.length,
        global: {
          avgReviewDays: global.avgReviewDays,
          medianReviewDays: global.medianReviewDays,
          positiveShare: global.positiveShare,
          avgWordCount: global.avgWordCount,
          avgQualityScore: global.avgQualityScore,
        },
      },
      pairs: sorted,
    });
  });
}

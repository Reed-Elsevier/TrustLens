import { NextResponse } from "next/server";
export { badRequest, notFound, withApiRequest } from "@/lib/publishing/http";

/** Same `{ error: { code, message } }` shape as the publishing and legal APIs, with analyze-specific codes. */
export function analyzeError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

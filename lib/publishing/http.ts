import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";

export type ApiErrorCode = "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL";

export function apiError(status: number, code: ApiErrorCode, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function badRequest(message: string) {
  return apiError(400, "BAD_REQUEST", message);
}

export function notFound(message: string) {
  return apiError(404, "NOT_FOUND", message);
}

export function internalError(message = "Internal server error") {
  return apiError(500, "INTERNAL", message);
}

export async function withApiRequest(label: string, handler: () => Response | Promise<Response>): Promise<Response> {
  const startedAt = Date.now();
  try {
    return await handler();
  } catch (err) {
    unstable_rethrow(err);
    console.error(`[publishing] ${label} failed with an unexpected error`);
    return internalError();
  } finally {
    logDuration(label, startedAt);
  }
}

/** Logs the duration of a request/operation. console.log is fine per spec. */
export function logDuration(label: string, startedAtMs: number) {
  const durationMs = Date.now() - startedAtMs;
  console.log(`[publishing] ${label} took ${durationMs}ms`);
}

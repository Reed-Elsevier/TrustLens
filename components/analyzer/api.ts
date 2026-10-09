import type { AnalysisResult, ApiErrorBody, ChatResponse, ChatTurn, ReviewResponse } from "@/lib/analyze/types";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function parse<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as ApiErrorBody | null)?.error?.message;
    throw new ApiRequestError(message ?? "Something went wrong. Please try again.", response.status);
  }
  return body as T;
}

const postJson = (url: string, body: unknown, signal?: AbortSignal) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });

export async function uploadPdf(file: File, signal: AbortSignal): Promise<AnalysisResult> {
  const form = new FormData();
  form.set("file", file);
  return parse<AnalysisResult>(await fetch("/api/analyze", { method: "POST", body: form, signal }));
}

export async function requestReview(analysisId: string, signal: AbortSignal): Promise<ReviewResponse> {
  return parse<ReviewResponse>(await postJson("/api/analyze/review", { analysisId }, signal));
}

export async function sendChat(analysisId: string, message: string, history: ChatTurn[], signal?: AbortSignal): Promise<ChatResponse> {
  return parse<ChatResponse>(await postJson("/api/analyze/chat", { analysisId, message, history }, signal));
}

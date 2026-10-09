import { NextRequest, NextResponse } from "next/server";
import { ANALYSIS_ID_PATTERN, CHAT_CONFIG } from "@/lib/analyze/config";
import { chatAbout } from "@/lib/analyze/chat";
import { badRequest, notFound, readJsonObject, withApiRequest } from "@/lib/analyze/http";
import type { ChatTurn } from "@/lib/analyze/types";

function parseHistory(value: unknown): ChatTurn[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 40) return undefined;
  const turns: ChatTurn[] = [];
  for (const item of value) {
    const turn = item as Partial<ChatTurn> | null;
    if (!turn || (turn.role !== "user" && turn.role !== "assistant") || typeof turn.content !== "string") return undefined;
    turns.push({ role: turn.role, content: turn.content });
  }
  return turns;
}

export async function POST(request: NextRequest) {
  return withApiRequest("POST /api/analyze/chat", async () => {
    const body = await readJsonObject(request);
    const analysisId = body?.analysisId;
    const message = body?.message;
    if (typeof analysisId !== "string" || !ANALYSIS_ID_PATTERN.test(analysisId)) return badRequest("analysisId must be a 16-character hex id");
    if (typeof message !== "string" || !message.trim()) return badRequest("message must be a non-empty string");
    if (message.length > CHAT_CONFIG.maxMessageChars) return badRequest(`message must be at most ${CHAT_CONFIG.maxMessageChars} characters`);
    const history = parseHistory(body?.history);
    if (!history) return badRequest("history must be an array of { role: user|assistant, content: string }");
    if (body?.allowAi !== undefined && typeof body.allowAi !== "boolean") return badRequest("allowAi must be a boolean");
    const result = await chatAbout(analysisId, message, history, body?.allowAi === true);
    return result ? NextResponse.json(result) : notFound("Analysis not found or expired. Upload the PDF again.");
  });
}

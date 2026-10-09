import { getClaudeClient, getClaudeModel } from "@/lib/claude";
import { AI_CONFIG } from "@/lib/legal/config";
export { badRequest, notFound, withApiRequest } from "@/lib/publishing/http";

export function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1").trim();
}

export class InvalidLegalAnswer extends Error {}

// One wall-clock budget includes the optional validation retry; SDK retries are disabled.
export async function askLegal<T>(system: string, evidence: unknown, validate: (text: string) => T, retries = 0): Promise<T | undefined> {
  const controller = new AbortController();
  const deadline = Date.now() + AI_CONFIG.timeoutMs;
  const timer = setTimeout(() => controller.abort(), AI_CONFIG.timeoutMs);
  const abort = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error("Legal AI deadline exceeded")), { once: true });
  });
  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        controller.signal.throwIfAborted();
        const response = await Promise.race([
          getClaudeClient().messages.create({
            model: getClaudeModel(), max_tokens: AI_CONFIG.maxTokens, system,
            messages: [{ role: "user", content: JSON.stringify(evidence) }],
          }, { signal: controller.signal, timeout: Math.max(1, deadline - Date.now()), maxRetries: 0 }),
          abort,
        ]);
        const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
        return validate(text);
      } catch (error) {
        if (!(error instanceof InvalidLegalAnswer) || controller.signal.aborted || attempt === retries) {
          console.error("[legal] Claude unavailable or invalid; using deterministic fallback");
          return undefined;
        }
      }
    }
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export function validateSummary(text: string, maxWords: number): string {
  const result = text.trim();
  if (!result || result.split(/\s+/).length > maxWords) throw new InvalidLegalAnswer("Invalid summary length");
  return result;
}

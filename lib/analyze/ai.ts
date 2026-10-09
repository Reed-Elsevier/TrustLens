import { getClaudeClient, getClaudeModel } from "@/lib/claude";
import { AI_CONFIG } from "@/lib/legal/config";
import { InvalidLegalAnswer } from "@/lib/legal/http";
import type { ChatTurn } from "@/lib/analyze/types";

export { InvalidLegalAnswer as InvalidAnswer };

export function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1").trim();
}

export function clampWords(text: string, maxWords: number): string {
  const parts = text.trim().split(/\s+/);
  return parts.length <= maxWords ? text.trim() : `${parts.slice(0, maxWords).join(" ")}…`;
}

/**
 * One Claude call with a single shared 20 s wall-clock budget (including the optional validation retry),
 * SDK retries disabled, and no raw error text logged. Returns undefined so callers can use a fallback.
 */
export async function askClaude<T>(options: {
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
  validate: (text: string) => T;
  retries?: number;
}): Promise<T | undefined> {
  const controller = new AbortController();
  const deadline = Date.now() + AI_CONFIG.timeoutMs;
  const timer = setTimeout(() => controller.abort(), AI_CONFIG.timeoutMs);
  const abort = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error("AI deadline exceeded")), { once: true });
  });
  const retries = options.retries ?? 0;
  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        controller.signal.throwIfAborted();
        const response = await Promise.race([
          getClaudeClient().messages.create(
            { model: getClaudeModel(), max_tokens: options.maxTokens, system: options.system, messages: options.messages },
            { signal: controller.signal, timeout: Math.max(1, deadline - Date.now()), maxRetries: 0 },
          ),
          abort,
        ]);
        const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
        return options.validate(text);
      } catch (error) {
        if (!(error instanceof InvalidLegalAnswer) || controller.signal.aborted || attempt === retries) {
          console.error("[analyze] Claude unavailable or invalid; using deterministic fallback");
          return undefined;
        }
      }
    }
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

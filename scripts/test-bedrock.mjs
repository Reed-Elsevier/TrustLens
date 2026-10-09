#!/usr/bin/env node
/**
 * One-shot smoke test for the Claude-on-Bedrock integration.
 *
 * Sends a single tiny request ("Say hi", max_tokens 64) through the same
 * endpoint/client configuration as lib/claude.ts, and prints the reply text,
 * model ID, and region used. Never prints the bearer token.
 *
 * Usage:
 *   node --env-file=.env.local scripts/test-bedrock.mjs
 */
import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_CLAUDE_MODEL = "anthropic.claude-sonnet-5";

const apiKey = process.env.AWS_BEARER_TOKEN_BEDROCK;
const region = process.env.AWS_REGION;
const model = process.env.CLAUDE_MODEL ?? DEFAULT_CLAUDE_MODEL;

if (!apiKey) {
  console.error("Missing required environment variable: AWS_BEARER_TOKEN_BEDROCK");
  process.exit(1);
}
if (!region) {
  console.error("Missing required environment variable: AWS_REGION");
  process.exit(1);
}

const client = new Anthropic({
  apiKey,
  baseURL: `https://bedrock-mantle.${region}.api.aws/anthropic`,
});

async function main() {
  console.log(`Testing Bedrock Claude: model=${model}, region=${region}`);

  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 64,
      messages: [{ role: "user", content: "Say hi" }],
    });
  } catch (err) {
    const status = err?.status;
    if (status === 401) {
      console.error("FAILED: Token expired, malformed, or created in a different region");
    } else if (status === 403 || isModelAccessError(err)) {
      console.error(
        "FAILED: Model not enabled for this account/region; enable it in the Bedrock console or set CLAUDE_MODEL to another ID"
      );
    } else {
      console.error(`FAILED: ${err?.message ?? String(err)}`);
    }
    process.exit(1);
  }

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  console.log(`Model: ${model}`);
  console.log(`Region: ${region}`);
  console.log(`Reply: ${text}`);
}

function isModelAccessError(err) {
  const message = String(err?.message ?? "").toLowerCase();
  return message.includes("model") && (message.includes("access") || message.includes("not enabled") || message.includes("not found"));
}

main().catch((err) => {
  console.error(`FAILED: ${err?.message ?? String(err)}`);
  process.exit(1);
});

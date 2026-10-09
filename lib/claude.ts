import Anthropic from "@anthropic-ai/sdk";

/**
 * Shared client wrapper for Claude in Amazon Bedrock, accessed server-side
 * only via the `@anthropic-ai/sdk` Anthropic client pointed at Bedrock's
 * Anthropic-compatible endpoint. The bearer token is read server-side only
 * (never exposed to the client, and never logged) and the model defaults to
 * CLAUDE_MODEL.
 */
export const DEFAULT_CLAUDE_MODEL = "anthropic.claude-sonnet-5";

export function getClaudeModel(): string {
  return process.env.CLAUDE_MODEL ?? DEFAULT_CLAUDE_MODEL;
}

let client: Anthropic | undefined;

export function getClaudeClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.AWS_BEARER_TOKEN_BEDROCK;
    const region = process.env.AWS_REGION;
    if (!apiKey) {
      throw new Error("Missing required environment variable: AWS_BEARER_TOKEN_BEDROCK");
    }
    if (!region) {
      throw new Error("Missing required environment variable: AWS_REGION");
    }
    client = new Anthropic({
      apiKey,
      baseURL: `https://bedrock-mantle.${region}.api.aws/anthropic`,
    });
  }
  return client;
}
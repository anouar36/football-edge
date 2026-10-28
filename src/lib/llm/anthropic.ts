import Anthropic from "@anthropic-ai/sdk";
import {
  buildExtractedOdds,
  buildReview,
  oddsSystemPrompt,
  oddsUserPrompt,
  reviewSystemPrompt,
  reviewUserPrompt,
  summarySystemPrompt,
  summaryUserPrompt,
} from "./prompts";
import { LLM_TIMEOUTS, timeLimit, type LlmProvider } from "./types";

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1 });
  return client;
}

const textOf = (res: Anthropic.Message) =>
  res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

export function anthropicProvider(model: string): LlmProvider {
  return {
    id: "anthropic",
    name: "Claude",
    model,

    async reviewPick(input, opts) {
      try {
        const res = await getClient().messages.create({
          model,
          max_tokens: 1500,
          system: reviewSystemPrompt(input.language),
          messages: [{ role: "user", content: reviewUserPrompt(input) }],
          ...(input.useWebSearch
            ? { tools: [{ type: "web_search_20250305" as const, name: "web_search" as const, max_uses: 3 }] }
            : {}),
        }, timeLimit(opts?.timeoutMs ?? LLM_TIMEOUTS.review));

        const sources: { title: string; url: string }[] = [];
        for (const b of res.content) {
          if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
            for (const r of b.content) if (r.type === "web_search_result") sources.push({ title: r.title, url: r.url });
          }
        }
        return buildReview(textOf(res), sources, `anthropic/${model}`);
      } catch (e) {
        console.error(`[claude] review failed for ${input.home} vs ${input.away}:`, (e as Error).message);
        return null;
      }
    },

    async dailySummary(picks, ctx, opts) {
      try {
        const res = await getClient().messages.create({
          model,
          max_tokens: 700,
          system: summarySystemPrompt(ctx.language),
          messages: [{ role: "user", content: summaryUserPrompt(picks, ctx) }],
        }, timeLimit(opts?.timeoutMs ?? LLM_TIMEOUTS.summary));
        return textOf(res).trim();
      } catch (e) {
        console.error("[claude] summary failed:", (e as Error).message);
        return null;
      }
    },

    async extractOdds(image, expected, opts) {
      try {
        const res = await getClient().messages.create({
          model,
          max_tokens: 3000,
          system: oddsSystemPrompt(),
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
                { type: "text", text: oddsUserPrompt(expected) },
              ],
            },
          ],
        }, timeLimit(opts?.timeoutMs ?? LLM_TIMEOUTS.odds));
        return buildExtractedOdds(textOf(res));
      } catch (e) {
        console.error("[claude] odds extraction failed:", (e as Error).message);
        return null;
      }
    },
  };
}

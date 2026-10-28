import OpenAI from "openai";
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

let client: OpenAI | null = null;
function getClient() {
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 1 });
  return client;
}

function textOf(res: OpenAI.Responses.Response) {
  if (!res.output_text) throw new Error(`empty response (${res.incomplete_details?.reason ?? res.status ?? "no text"})`);
  return res.output_text;
}

export function openaiProvider(model: string): LlmProvider {
  return {
    id: "openai",
    name: "ChatGPT",
    model,

    async reviewPick(input, opts) {
      try {
        const res = await getClient().responses.create({
          model,
          // Reasoning models spend part of this before writing, so the caps are higher than Claude's.
          max_output_tokens: 8000,
          instructions: reviewSystemPrompt(input.language),
          input: reviewUserPrompt(input),
          ...(input.useWebSearch ? { tools: [{ type: "web_search" as const }], max_tool_calls: 3 } : {}),
        }, timeLimit(opts?.timeoutMs ?? LLM_TIMEOUTS.review));

        const sources: { title: string; url: string }[] = [];
        for (const item of res.output) {
          if (item.type !== "message") continue;
          for (const part of item.content) {
            if (part.type !== "output_text") continue;
            for (const a of part.annotations) if (a.type === "url_citation") sources.push({ title: a.title || a.url, url: a.url });
          }
        }
        return buildReview(textOf(res), sources, `openai/${model}`);
      } catch (e) {
        console.error(`[openai] review failed for ${input.home} vs ${input.away}:`, (e as Error).message);
        return null;
      }
    },

    async dailySummary(picks, ctx, opts) {
      try {
        const res = await getClient().responses.create({
          model,
          max_output_tokens: 4000,
          instructions: summarySystemPrompt(ctx.language),
          input: summaryUserPrompt(picks, ctx),
        }, timeLimit(opts?.timeoutMs ?? LLM_TIMEOUTS.summary));
        return textOf(res).trim();
      } catch (e) {
        console.error("[openai] summary failed:", (e as Error).message);
        return null;
      }
    },

    async extractOdds(image, expected, opts) {
      try {
        const res = await getClient().responses.create({
          model,
          max_output_tokens: 8000,
          instructions: oddsSystemPrompt(),
          input: [
            {
              role: "user",
              content: [
                // "high" keeps small digits legible.
                { type: "input_image", image_url: `data:${image.mediaType};base64,${image.data}`, detail: "high" },
                { type: "input_text", text: oddsUserPrompt(expected) },
              ],
            },
          ],
        }, timeLimit(opts?.timeoutMs ?? LLM_TIMEOUTS.odds));
        return buildExtractedOdds(textOf(res));
      } catch (e) {
        console.error("[openai] odds extraction failed:", (e as Error).message);
        return null;
      }
    },
  };
}

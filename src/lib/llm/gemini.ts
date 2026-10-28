import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";
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
import { LLM_TIMEOUTS, type LlmProvider } from "./types";

let client: GoogleGenAI | null = null;
function getClient() {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

function textOf(res: GenerateContentResponse) {
  const text = res.text;
  if (!text) throw new Error(`empty response (${res.candidates?.[0]?.finishReason ?? res.promptFeedback?.blockReason ?? "no text"})`);
  return text;
}

export function geminiProvider(model: string): LlmProvider {
  return {
    id: "gemini",
    name: "Gemini",
    model,

    async reviewPick(input, opts) {
      try {
        const res = await getClient().models.generateContent({
          model,
          contents: reviewUserPrompt(input),
          config: {
            systemInstruction: reviewSystemPrompt(input.language),
            // Thinking tokens count towards this, so the caps are higher than Claude's.
            maxOutputTokens: 8000,
            ...(input.useWebSearch ? { tools: [{ googleSearch: {} }] } : {}),
            abortSignal: AbortSignal.timeout(opts?.timeoutMs ?? LLM_TIMEOUTS.review),
          },
        });

        const sources: { title: string; url: string }[] = [];
        for (const chunk of res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
          if (chunk.web?.uri) sources.push({ title: chunk.web.title || chunk.web.uri, url: chunk.web.uri });
        }
        return buildReview(textOf(res), sources, `gemini/${model}`);
      } catch (e) {
        console.error(`[gemini] review failed for ${input.home} vs ${input.away}:`, (e as Error).message);
        return null;
      }
    },

    async dailySummary(picks, ctx, opts) {
      try {
        const res = await getClient().models.generateContent({
          model,
          contents: summaryUserPrompt(picks, ctx),
          config: { systemInstruction: summarySystemPrompt(ctx.language), maxOutputTokens: 4000, abortSignal: AbortSignal.timeout(opts?.timeoutMs ?? LLM_TIMEOUTS.summary) },
        });
        return textOf(res).trim();
      } catch (e) {
        console.error("[gemini] summary failed:", (e as Error).message);
        return null;
      }
    },

    async extractOdds(image, expected, opts) {
      try {
        const res = await getClient().models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [{ inlineData: { mimeType: image.mediaType, data: image.data } }, { text: oddsUserPrompt(expected) }],
            },
          ],
          config: { systemInstruction: oddsSystemPrompt(), maxOutputTokens: 8000, abortSignal: AbortSignal.timeout(opts?.timeoutMs ?? LLM_TIMEOUTS.odds) },
        });
        return buildExtractedOdds(textOf(res));
      } catch (e) {
        console.error("[gemini] odds extraction failed:", (e as Error).message);
        return null;
      }
    },
  };
}

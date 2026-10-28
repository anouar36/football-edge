import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import type { ProviderId } from "./types";

/*
 * "Ask the AI to explain" in the ticket panel: a short streamed answer from the provider chosen in
 * Settings. Server-side only (keys stay on the server). The numbers come from the ticket maths; the
 * AI only puts them into words.
 */

const LANG: Record<string, string> = { ar: "Arabic", fr: "French", en: "English", darija: "Moroccan Darija written in Arabic script" };

export interface ExplainInput {
  name: string;
  currency: string;
  stake: number;
  prob: number;
  totalOdds: number | null;
  ev: number | null;
  margin: number | null;
  legs: { match: string; label: string; odds: number | null; prob: number; edge: number | null; modelOnly: boolean; sameMatch: boolean; review: string | null }[];
  tips: string[];
}

const p1 = (x: number) => `${(x * 100).toFixed(1)}%`;

export function explainSystemPrompt(language: string, name: string) {
  return `You explain a football accumulator ("ticket") to ${name}, in ${LANG[language] ?? "English"}. Address ${name} by name once.
Plain text, 4 to 6 short sentences, no markdown, no lists, no headings.
Use only the numbers given. Never invent probabilities, form, injuries or news.
Say what has to happen for the ticket to win, why the win probability is what it is (legs from the same match are
correlated and their joint probability is already used), what the expected value means in money for this stake, and
the one change that helps most (use the tips). Be honest and calm. Never promise a win.`;
}

export function explainUserPrompt(t: ExplainInput) {
  const legs = t.legs
    .map(
      (l, i) =>
        `${i + 1}. ${l.match}: ${l.label} @ ${l.odds?.toFixed(2) ?? "no odds yet"} | win probability ${p1(l.prob)}${l.modelOnly ? " (model only, no market odds)" : ""}` +
        `${l.edge != null ? ` | value as a single ${p1(l.edge)}` : ""}${l.sameMatch ? " | same match as another leg" : ""}${l.review ? ` | AI review ${l.review}` : ""}`
    )
    .join("\n");
  return `Ticket of ${t.legs.length} legs, stake ${t.stake.toFixed(2)} ${t.currency}.
${legs}
Win probability of the whole ticket: ${p1(t.prob)}. Total odds: ${t.totalOdds?.toFixed(2) ?? "unknown (odds missing)"}.
Expected value: ${t.ev != null ? `${p1(t.ev)} (${(t.stake * t.ev).toFixed(2)} ${t.currency} on this stake)` : "unknown"}. Bookmaker margin on the ticket: ${t.margin != null ? p1(t.margin) : "unknown"}.
Tips already shown to ${t.name}:
${t.tips.map((x) => `- ${x}`).join("\n") || "- none"}`;
}

/** The answer as it is written, chunk by chunk. */
export async function* streamExplanation(provider: ProviderId, model: string, system: string, user: string, signal: AbortSignal): AsyncGenerator<string> {
  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const stream = await client.messages.create({ model, max_tokens: 700, system, messages: [{ role: "user", content: user }], stream: true }, { signal });
    for await (const ev of stream) if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text;
  } else if (provider === "openai") {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // Reasoning models spend part of the budget before writing.
    const stream = await client.responses.create({ model, instructions: system, input: user, max_output_tokens: 4000, stream: true }, { signal });
    for await (const ev of stream) if (ev.type === "response.output_text.delta") yield ev.delta;
  } else {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const stream = await client.models.generateContentStream({ model, contents: user, config: { systemInstruction: system, maxOutputTokens: 4000, abortSignal: signal } });
    for await (const chunk of stream) if (chunk.text) yield chunk.text;
  }
}

import type { Settings } from "../schema";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import { openaiProvider } from "./openai";
import { isProviderId, PROVIDER_IDS, PROVIDER_NAMES, type LlmProvider, type ProviderId } from "./types";

export * from "./types";

const CONFIG: Record<ProviderId, { keyEnv: string; modelEnv: string; fallbackModel: string; create: (model: string) => LlmProvider }> = {
  anthropic: { keyEnv: "ANTHROPIC_API_KEY", modelEnv: "CLAUDE_MODEL", fallbackModel: "claude-sonnet-5-5", create: anthropicProvider },
  openai: { keyEnv: "OPENAI_API_KEY", modelEnv: "OPENAI_MODEL", fallbackModel: "gpt-5.5", create: openaiProvider },
  gemini: { keyEnv: "GEMINI_API_KEY", modelEnv: "GEMINI_MODEL", fallbackModel: "gemini-flash-latest", create: geminiProvider },
};

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  keyEnv: string;
  keySet: boolean;
  /** Model used when settings.llmModel is empty: the *_MODEL env var, else a built-in default. */
  defaultModel: string;
}

/** A placeholder copied from .env.example ("sk-ant-...") counts as no key. */
const hasKey = (v: string | undefined) => Boolean(v?.trim() && !v.trim().endsWith("..."));

function info(id: ProviderId): ProviderInfo {
  const c = CONFIG[id];
  return { id, name: PROVIDER_NAMES[id], keyEnv: c.keyEnv, keySet: hasKey(process.env[c.keyEnv]), defaultModel: process.env[c.modelEnv] || c.fallbackModel };
}

/** Which keys are set. Safe to send to the browser: it holds no key values. */
export function providerStatus(): Record<ProviderId, ProviderInfo> {
  return Object.fromEntries(PROVIDER_IDS.map((id) => [id, info(id)])) as Record<ProviderId, ProviderInfo>;
}

type LlmSettings = Pick<Settings, "llmProvider" | "llmModel">;

/** The provider chosen in Settings and the model it will use. */
export function activeProvider(settings: LlmSettings): ProviderInfo & { model: string } {
  const p = info(isProviderId(settings.llmProvider) ? settings.llmProvider : "anthropic");
  return { ...p, model: settings.llmModel?.trim() || p.defaultModel };
}

/** Null when the chosen provider has no API key: picks are then saved without a review. */
export function getProvider(settings: LlmSettings): LlmProvider | null {
  const p = activeProvider(settings);
  if (!p.keySet) {
    console.warn(`[llm] ${p.name} is selected but ${p.keyEnv} is not set: picks are saved without a review`);
    return null;
  }
  return CONFIG[p.id].create(p.model);
}

/** Splits MatchReview.model ("openai/gpt-5.5") for display. Older reviews stored only the model id. */
export function reviewer(model: string): { name: string | null; model: string } {
  const slash = model.indexOf("/");
  const prefix = model.slice(0, slash);
  if (slash > 0 && isProviderId(prefix)) return { name: PROVIDER_NAMES[prefix], model: model.slice(slash + 1) };
  if (model.startsWith("claude-")) return { name: PROVIDER_NAMES.anthropic, model };
  return { name: null, model };
}

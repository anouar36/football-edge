/** The AI analysts the app can use. Each one reads its own API key from the environment. */
export const PROVIDER_IDS = ["anthropic", "openai", "gemini"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_NAMES: Record<ProviderId, string> = { anthropic: "Claude", openai: "ChatGPT", gemini: "Gemini" };

export const isProviderId = (v: unknown): v is ProviderId => PROVIDER_IDS.includes(v as ProviderId);

export interface MatchReview {
  verdict: "KEEP" | "CAUTION" | "AVOID";
  headline: string;
  summary: string;
  factors: { label: string; impact: "positive" | "negative" | "neutral" }[];
  news: string[];
  sources: { title: string; url: string }[];
  /** "provider/model", e.g. "anthropic/claude-sonnet-5-5". Older reviews hold the bare model id. */
  model: string;
  reviewedAt: string;
}

export interface ReviewInput {
  league: string;
  kickoff: string;
  home: string;
  away: string;
  pick: { label: string; odds: number; prob: number; marketProb: number; edge: number };
  xgHome: number;
  xgAway: number;
  topScores: { score: string; p: number }[];
  language: string;
  useWebSearch: boolean;
}

export interface SummaryPick {
  match: string;
  label: string;
  odds: number;
  prob: number;
  edge: number;
  stake: number;
  verdict?: string | null;
}

export interface SummaryContext {
  bankroll: number;
  currency: string;
  language: string;
  matchesAnalysed: number;
}

export const ODDS_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export interface OddsImage {
  /** Base64 without the "data:" prefix. */
  data: string;
  mediaType: (typeof ODDS_IMAGE_TYPES)[number];
}

/** The match the user says the screenshot is for, so the model can map 1/2 to HOME/AWAY and spot a wrong match. */
export interface ExpectedMatch {
  home: string;
  away: string;
}

export interface ExtractedOdds {
  bookmaker?: string;
  /** Team names as printed in the image. */
  home?: string;
  away?: string;
  /** False when the image clearly shows another fixture than the expected one; undefined when it cannot tell. */
  sameMatch?: boolean;
  /** Only keys from DISPLAY_KEYS, each at most once, odds in decimal format. */
  markets: { key: string; odds: number; rawLabel: string }[];
}

/** Default time limit of each call (ms), retries included. A call that runs over is abandoned: the method returns null. */
export const LLM_TIMEOUTS = { review: 90_000, summary: 45_000, odds: 50_000 } as const;

export interface CallOptions {
  /** Overrides the default time limit, e.g. with what is left of the daily run's budget. */
  timeoutMs?: number;
}

/** Request options for the Anthropic and OpenAI SDKs: the signal also stops a retry that would run past the limit. */
export const timeLimit = (ms: number) => ({ timeout: ms, signal: AbortSignal.timeout(ms) });

/**
 * An AI analyst reviews what the statistical model cannot see (injuries,
 * suspensions, rotation, motivation, weather). It never invents the
 * probabilities. Every method returns null on failure (including a time-out)
 * so the caller can carry on without it.
 */
export interface LlmProvider {
  id: ProviderId;
  name: string;
  model: string;
  reviewPick(input: ReviewInput, opts?: CallOptions): Promise<MatchReview | null>;
  dailySummary(picks: SummaryPick[], ctx: SummaryContext, opts?: CallOptions): Promise<string | null>;
  /** Reads bookmaker odds from a screenshot. An image with no readable odds gives `markets: []`, not null. */
  extractOdds(image: OddsImage, expected?: ExpectedMatch, opts?: CallOptions): Promise<ExtractedOdds | null>;
}

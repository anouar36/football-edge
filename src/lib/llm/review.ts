import type { MatchReview } from "./types";

type Impact = MatchReview["factors"][number]["impact"];
const IMPACTS = new Set<unknown>(["positive", "negative", "neutral"]);

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Web pages only: a javascript: or data: link from the model or a search result is dropped. */
function webUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * A review the pages can render as it is: text where text is shown (a nested object
 * would crash the match page), a known verdict and impact, web links only, bounded lengths.
 * Used on the model's JSON and on reviews read back from the database.
 */
export function normalizeReview(raw: unknown): MatchReview | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const j = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const factors = (Array.isArray(j.factors) ? j.factors : []).flatMap((f) => {
    const o = typeof f === "string" ? { label: f } : f && typeof f === "object" ? (f as Record<string, unknown>) : {};
    const label = text(o.label, 200);
    return label ? [{ label, impact: (IMPACTS.has(o.impact) ? o.impact : "neutral") as Impact }] : [];
  });
  const sources = (Array.isArray(j.sources) ? j.sources : []).flatMap((s) => {
    const o = (s && typeof s === "object" ? s : {}) as { title?: unknown; url?: unknown };
    const url = webUrl(o.url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{ title: text(o.title, 200) || new URL(url).hostname, url }];
  });
  return {
    verdict: j.verdict === "AVOID" || j.verdict === "CAUTION" ? j.verdict : "KEEP",
    headline: text(j.headline, 200),
    summary: text(j.summary, 2000),
    factors: factors.slice(0, 6),
    news: (Array.isArray(j.news) ? j.news : []).map((n) => text(n, 300)).filter(Boolean).slice(0, 5),
    sources: sources.slice(0, 5),
    model: text(j.model, 120),
    reviewedAt: text(j.reviewedAt, 40),
  };
}

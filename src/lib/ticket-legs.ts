import { marketLabel } from "./model/markets";
import { devig, oddsGroup, overround } from "./model/value";
import type { TicketLeg } from "./model/ticket";
import { normalizeReview } from "./llm/review";
import type { MatchLite, PickLite } from "./data";
import type { PredictionJson } from "./queries";
import type { Match } from "./schema";

/**
 * A ticket leg for one market of a stored match, from the light row the lists load (data.ts).
 * The probability is the findValue blend when complete bookmaker odds exist for the market (`blend`
 * when the caller has the stored value, else recomputed from the odds), the raw model otherwise.
 * Null if the model has no such market.
 */
export function legFromLite(
  m: MatchLite,
  key: string,
  modelProb: number | null | undefined,
  modelWeight: number,
  opts: { blend?: number; odds?: number; pick?: { key: string; verdict: string | null } | null } = {}
): TicketLeg | null {
  if (modelProb == null || m.xgHome == null || m.xgAway == null || m.rho == null) return null;
  const odds = (m.odds ?? {}) as Record<string, number>;
  // The stored odds of this market, when complete (they sum to 1 after removing the margin), as in findValue.
  const group = oddsGroup(odds, key) ?? [];
  const prob = group.length
    ? opts.blend ?? modelWeight * modelProb + (1 - modelWeight) * devig(group.map((k) => odds[k]))[group.indexOf(key)]
    : modelProb;
  const verdict = opts.pick?.verdict;
  return {
    matchId: m.id,
    home: m.home,
    away: m.away,
    league: m.league,
    kickoff: m.kickoff.toISOString(),
    key,
    label: marketLabel(key, m.home, m.away),
    prob,
    modelProb,
    odds: opts.odds ?? odds[key] ?? null,
    modelOnly: group.length === 0,
    overround: group.length > 1 ? overround(group.map((k) => odds[k])) : null,
    model: { xgHome: m.xgHome, xgAway: m.xgAway, rho: m.rho, xcHome: m.xcHome, xcAway: m.xcAway, cornerDispersion: m.cornerDispersion },
    review:
      opts.pick && m.headline && (verdict === "CAUTION" || verdict === "AVOID") ? { verdict, headline: m.headline, pickKey: opts.pick.key } : null,
  };
}

/** The match page has the full row: its light form, so legs come from legFromLite too. */
export function liteOf(m: Match): MatchLite {
  const p = m.prediction as PredictionJson | null;
  return {
    id: m.id,
    league: m.league,
    kickoff: m.kickoff,
    home: m.home,
    away: m.away,
    status: m.status,
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    odds: m.odds,
    xgHome: p?.xgHome ?? null,
    xgAway: p?.xgAway ?? null,
    rho: p?.model.rho ?? null,
    xcHome: p?.xcHome ?? null,
    xcAway: p?.xcAway ?? null,
    cornerDispersion: p?.model.cornerDispersion ?? null,
    headline: normalizeReview(m.analysis)?.headline ?? null,
  };
}

/** A leg from a pick: its stored blend, model probability and odds (a screenshot pick's are the bookmaker's), so the ticket shows what the pick shows. */
export const legFromPick = (p: PickLite, modelWeight: number) =>
  legFromLite(p.match, p.key, p.modelProb, modelWeight, { blend: p.prob, odds: p.odds, pick: { key: p.key, verdict: p.verdict } });

/** Open value picks the advice can suggest adding: not started, not skipped, not rejected by the AI review. */
export function suggestionLegs(picks: PickLite[], modelWeight: number, now = new Date()): TicketLeg[] {
  return picks
    .filter((p) => p.status !== "SKIPPED" && p.verdict !== "AVOID" && p.match.kickoff > now)
    .map((p) => legFromPick(p, modelWeight))
    .filter((l): l is TicketLeg => l !== null);
}

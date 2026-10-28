import { cache } from "react";
import { and, eq, gte } from "drizzle-orm";
import { picksWithMatch } from "./db";
import { allLogos } from "./data";
import { matches, picks, type Match, type PickWithMatch } from "./schema";
import type { Prediction } from "./model/predict";
import type { Candidate } from "./model/value";
import { normalizeReview } from "./llm/review";

export type PredictionJson = Prediction & { candidates: Candidate[] };
export const pred = (m: Match) => m.prediction as PredictionJson | null;
/** The stored AI review, cleaned for rendering (older rows were saved before reviews were checked). */
export const review = (m: Match) => normalizeReview(m.analysis);

export interface Logos {
  team: (name: string, league: string) => string | null;
  league: (code: string) => string | null;
}

/**
 * Team and league logos, from the cached logo table (data.ts allLogos: no query on most requests).
 * Logos are decoration: if the read fails the page still renders, with initials.
 */
export const loadLogos = cache(async (): Promise<Logos> => {
  let teams = new Map<string, string>();
  let leagues = new Map<string, string>();
  try {
    const all = await allLogos();
    teams = new Map(all.teams);
    leagues = new Map(all.leagues);
  } catch (e) {
    console.warn(`[logos] ${(e as Error).message}`);
  }
  return { team: (name, league) => teams.get(`${name}|${league}`) ?? null, league: (code) => leagues.get(code) ?? null };
});

export async function upcomingPicks() {
  return picksWithMatch(and(eq(picks.result, "PENDING"), gte(matches.kickoff, new Date(Date.now() - 3 * 3_600_000))));
}

export interface PerfStats {
  n: number;
  wins: number;
  staked: number;
  profit: number;
  roi: number;
  hitRate: number;
  expectedWins: number;
  avgClv: number | null;
  brier: number | null;
  curve: { i: number; date: string; profit: number }[];
}

export function perf(list: PickWithMatch[]): PerfStats {
  const settled = list
    .filter((p) => p.result === "WON" || p.result === "LOST")
    .sort((a, b) => a.match.kickoff.getTime() - b.match.kickoff.getTime());
  let profit = 0, staked = 0, wins = 0, ew = 0, clv = 0, clvN = 0, brier = 0;
  const curve: PerfStats["curve"] = [];
  settled.forEach((p, i) => {
    profit += p.profit ?? 0;
    staked += p.stake;
    if (p.result === "WON") wins++;
    ew += p.prob;
    brier += (p.prob - (p.result === "WON" ? 1 : 0)) ** 2;
    if (p.clv != null) {
      clv += p.clv;
      clvN++;
    }
    curve.push({ i: i + 1, date: p.match.kickoff.toISOString().slice(0, 10), profit: Math.round(profit * 100) / 100 });
  });
  const n = settled.length;
  return {
    n,
    wins,
    staked,
    profit,
    roi: staked > 0 ? profit / staked : 0,
    hitRate: n ? wins / n : 0,
    expectedWins: ew,
    avgClv: clvN ? clv / clvN : null,
    brier: n ? brier / n : null,
    curve,
  };
}

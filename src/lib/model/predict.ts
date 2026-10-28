import type { HistMatch } from "../data/footballdata";
import { expected, fitRatings, type Ratings } from "./ratings";
import { cornerMarkets, goalMarkets, scoreMatrix, topScores, type Probs } from "./markets";

export interface LeagueModel {
  league: string;
  goals: Ratings;
  corners: Ratings | null;
  promoted: string[];
  fittedAt: string;
}

export interface Prediction {
  xgHome: number;
  xgAway: number;
  xcHome: number | null;
  xcAway: number | null;
  probs: Probs;
  topScores: { score: string; p: number }[];
  homeRating: { attack: number; defence: number; games: number } | null;
  awayRating: { attack: number; defence: number; games: number } | null;
  dataWarning: string | null;
  model: { rho: number; homeAdv: number; cornerDispersion: number | null; trainingMatches: number };
}

/** Teams in the current season that did not play the previous season in this league. */
function promotedTeams(history: HistMatch[], now: Date): string[] {
  const seasonStart = new Date(Date.UTC(now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1, 6, 1));
  const prev = new Set<string>();
  const cur = new Set<string>();
  for (const m of history) {
    const set = m.kickoff < seasonStart ? prev : cur;
    set.add(m.home);
    set.add(m.away);
  }
  if (prev.size === 0) return [];
  return Array.from(cur).filter((t) => !prev.has(t));
}

export function fitLeague(league: string, history: HistMatch[], now = new Date()): LeagueModel {
  const promoted = promotedTeams(history, now);
  const priorTargets = Object.fromEntries(promoted.map((t) => [t, { attack: 0.85, defence: 1.15 }]));
  const goals = fitRatings(
    history.map((m) => ({ kickoff: m.kickoff, home: m.home, away: m.away, hs: m.hg, as: m.ag })),
    { refDate: now, priorTargets, estimateRho: true }
  );
  const withCorners = history.filter((m) => m.hc != null && m.ac != null);
  const corners =
    withCorners.length >= 40
      ? fitRatings(
          withCorners.map((m) => ({ kickoff: m.kickoff, home: m.home, away: m.away, hs: m.hc!, as: m.ac! })),
          { refDate: now, prior: 6 }
        )
      : null;
  return { league, goals, corners, promoted, fittedAt: now.toISOString() };
}

export function predictMatch(model: LeagueModel, home: string, away: string): Prediction {
  const g = expected(model.goals, home, away);
  const matrix = scoreMatrix(g.home, g.away, model.goals.rho);
  let probs: Probs = goalMarkets(matrix);
  let xcHome: number | null = null;
  let xcAway: number | null = null;
  if (model.corners) {
    const c = expected(model.corners, home, away, { attack: 0.95, defence: 1.05 });
    xcHome = c.home;
    xcAway = c.away;
    probs = { ...probs, ...cornerMarkets(c.home, c.away, model.corners.dispersion) };
  }
  const rating = (t: string) =>
    t in model.goals.attack
      ? { attack: model.goals.attack[t], defence: model.goals.defence[t], games: model.goals.games[t] }
      : null;
  const minGames = Math.min(model.goals.games[home] ?? 0, model.goals.games[away] ?? 0);
  return {
    xgHome: g.home,
    xgAway: g.away,
    xcHome,
    xcAway,
    probs,
    topScores: topScores(matrix),
    homeRating: rating(home),
    awayRating: rating(away),
    dataWarning: !g.known ? "One team has no match history in this league." : minGames < 8 ? "Few recent matches for one team." : null,
    model: {
      rho: model.goals.rho,
      homeAdv: model.goals.homeAdv,
      cornerDispersion: model.corners?.dispersion ?? null,
      trainingMatches: model.goals.nMatches,
    },
  };
}

/** 0-5 strength score for display (like a "rating"). */
export function strengthScore(r: { attack: number; defence: number } | null) {
  if (!r) return null;
  const s = Math.log(r.attack / r.defence); // ~ -1 .. 1
  return Math.max(0, Math.min(5, 2.5 + s * 2.5));
}

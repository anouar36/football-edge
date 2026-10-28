import type { Odds } from "../data/footballdata";
import type { Probs } from "./markets";

export interface StakeRules {
  bankroll: number;
  kellyFraction: number;
  maxStakePct: number;
  minEdge: number;
  minProb: number;
  minOdds: number;
  maxOdds: number;
  modelWeight: number;
}

export interface Candidate {
  key: string;
  market: string;
  selection: string;
  odds: number;
  modelProb: number;
  marketProb: number;
  prob: number;
  edge: number;
  kelly: number;
  stakePct: number;
  stake: number;
}

/** Remove the bookmaker margin from a group of odds (proportional method). */
export function devig(odds: number[]): number[] {
  const inv = odds.map((o) => 1 / o);
  const s = inv.reduce((a, b) => a + b, 0);
  return inv.map((v) => v / s);
}

export function overround(odds: number[]) {
  return odds.reduce((s, o) => s + 1 / o, 0) - 1;
}

/** Full Kelly fraction; 0 when there is no bet to make (no edge, odds ≤ 1, or a probability outside 0..1 or NaN). */
export const kellyFraction = (p: number, o: number) => (o > 1 && p >= 0 && p <= 1 ? Math.max(0, (p * o - 1) / (o - 1)) : 0);

export type KellyRules = Pick<StakeRules, "bankroll" | "kellyFraction" | "maxStakePct">;

export function stakeFor(p: number, o: number, rules: KellyRules) {
  const kelly = kellyFraction(p, o);
  const stakePct = Math.min(rules.maxStakePct, rules.kellyFraction * kelly);
  return { kelly, stakePct, stake: Math.round(rules.bankroll * stakePct * 100) / 100 };
}

/** The raw model probability against one bookmaker price (no market blending), as the match page shows it. */
export function priceCheck(p: number, o: number, rules: KellyRules) {
  return { prob: p, fair: 1 / p, edge: p * o - 1, ...stakeFor(p, o, rules) };
}

/**
 * Markets whose selections cover every outcome once, so their fair probabilities sum to 1.
 * Double chance is not one (its three selections sum to 2), nor a team's "over" on its own.
 */
const PARTITIONS: [RegExp, string[]][] = [
  [/^1X2$/, ["HOME", "DRAW", "AWAY"]],
  [/^DNB$/, ["HOME", "AWAY"]],
  [/^(OU|CORNERS)\d+(\.\d+)?$/, ["OVER", "UNDER"]],
  [/^BTTS$/, ["YES", "NO"]],
  [/^CORNERRACE$/, ["HOME", "TIE", "AWAY"]],
];

/**
 * The keys of `odds` in the market of `key` when they hold a price for every selection of that
 * market, else null: a lone price cannot be de-margined (it would look like a 100% favourite).
 */
export function oddsGroup(odds: Odds, key: string): string[] | null {
  const market = key.split(":")[0];
  const selections = PARTITIONS.find(([re]) => re.test(market))?.[1];
  if (!selections) return null;
  const keys = selections.map((s) => `${market}:${s}`);
  return keys.every((k) => odds[k] > 1) ? keys : null;
}

/** Complete markets in `odds`, each a group whose fair probabilities sum to 1. */
function groups(odds: Odds): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const k of Object.keys(odds)) {
    const g = oddsGroup(odds, k);
    if (g && !seen.has(g[0])) {
      seen.add(g[0]);
      out.push(g);
    }
  }
  return out;
}

export function findValue(probs: Probs, odds: Odds, rules: StakeRules): Candidate[] {
  const out: Candidate[] = [];
  for (const keys of groups(odds)) {
    const fair = devig(keys.map((k) => odds[k]));
    keys.forEach((key, i) => {
      const o = odds[key];
      const modelProb = probs[key];
      if (modelProb == null) return;
      const marketProb = fair[i];
      // Shrink the model toward the market: the market is a strong forecaster.
      const prob = rules.modelWeight * modelProb + (1 - rules.modelWeight) * marketProb;
      const edge = prob * o - 1;
      const { kelly, stakePct, stake } = stakeFor(prob, o, rules);
      const [market, selection] = key.split(":");
      out.push({ key, market, selection, odds: o, modelProb, marketProb, prob, edge, kelly, stakePct, stake });
    });
  }
  return out;
}

export function isPlayable(c: Candidate, r: StakeRules) {
  return c.edge >= r.minEdge && c.prob >= r.minProb && c.odds >= r.minOdds && c.odds <= r.maxOdds && c.stake > 0;
}

/** WON / LOST / VOID for a market key given the final score. */
export function settleKey(
  key: string,
  hg: number,
  ag: number,
  hc?: number | null,
  ac?: number | null
): "WON" | "LOST" | "VOID" {
  const [market, sel] = key.split(":");
  const line = Number(market.replace(/^[A-Z]+/, ""));
  const win = (b: boolean) => (b ? "WON" : "LOST");
  switch (true) {
    case market === "1X2":
      return win(sel === "HOME" ? hg > ag : sel === "AWAY" ? ag > hg : hg === ag);
    case market === "DC":
      return win(sel === "1X" ? hg >= ag : sel === "X2" ? ag >= hg : hg !== ag);
    case market === "DNB":
      return hg === ag ? "VOID" : win(sel === "HOME" ? hg > ag : ag > hg);
    case market.startsWith("OU"):
      return win(sel === "OVER" ? hg + ag > line : hg + ag < line);
    case market === "BTTS":
      return win(sel === "YES" ? hg > 0 && ag > 0 : !(hg > 0 && ag > 0));
    case market.startsWith("HOMEGOALS"):
      return win(hg > line);
    case market.startsWith("AWAYGOALS"):
      return win(ag > line);
    case market.startsWith("CORNERS"):
      if (hc == null || ac == null) return "VOID";
      return win(sel === "OVER" ? hc + ac > line : hc + ac < line);
    case market === "CORNERRACE":
      if (hc == null || ac == null) return "VOID";
      return win(sel === "HOME" ? hc > ac : sel === "AWAY" ? ac > hc : hc === ac);
    default:
      return "VOID";
  }
}

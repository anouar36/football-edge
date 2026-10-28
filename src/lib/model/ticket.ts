import { negBinPmf, scoreMatrix } from "./markets";
import { settleKey } from "./value";

/** Model parameters of the leg's match, enough to rebuild its score and corner distributions. */
export interface LegModel {
  xgHome: number;
  xgAway: number;
  rho: number;
  xcHome: number | null;
  xcAway: number | null;
  cornerDispersion: number | null;
}

export interface TicketLeg {
  matchId: string;
  home: string;
  away: string;
  league: string;
  kickoff: string;
  key: string; // "OU2.5:OVER"
  label: string;
  /** Blended with the market (as in findValue) when the bookmaker odds group is known, raw model otherwise. */
  prob: number;
  modelProb: number;
  /** Odds used on the ticket: the stored bookmaker odds, or what the user typed. */
  odds: number | null;
  /** True when there are no stored odds for this market, so prob is the model alone. */
  modelOnly: boolean;
  /** Margin of the stored odds group this key belongs to. */
  overround: number | null;
  model: LegModel | null;
  /** AI review of this match's pick (pickKey), when it said CAUTION or AVOID. */
  review?: { verdict: "CAUTION" | "AVOID"; headline: string; pickKey: string } | null;
}

export const legId = (l: Pick<TicketLeg, "matchId" | "key">) => `${l.matchId}|${l.key}`;
export const isCornerKey = (key: string) => key.startsWith("CORNER");
/** Markets that can be refunded (draw no bet). */
const voidable = (key: string) => key.startsWith("DNB:");

/** Below this joint probability, legs of one match are treated as contradicting each other. */
export const CONTRADICTION = 0.005;

type Cell = { w: number; hg: number; ag: number; hc: number | null; ac: number | null };

function goalCells(m: LegModel): Cell[] {
  const out: Cell[] = [];
  scoreMatrix(m.xgHome, m.xgAway, m.rho).forEach((row, x) => row.forEach((w, y) => out.push({ w, hg: x, ag: y, hc: null, ac: null })));
  return out;
}

/** Joint home/away corner counts, as in cornerMarkets (independent negative binomials, normalised). */
function cornerCells(m: LegModel): Cell[] | null {
  if (m.xcHome == null || m.xcAway == null || m.cornerDispersion == null) return null;
  const max = 30;
  const ph = negBinPmf(m.xcHome, m.cornerDispersion, max);
  const pa = negBinPmf(m.xcAway, m.cornerDispersion, max);
  const out: Cell[] = [];
  let norm = 0;
  for (let x = 0; x <= max; x++)
    for (let y = 0; y <= max; y++) {
      out.push({ w: ph[x] * pa[y], hg: 0, ag: 0, hc: x, ac: y });
      norm += ph[x] * pa[y];
    }
  return out.map((c) => ({ ...c, w: c.w / norm }));
}

/** P(no leg loses) and E[return per unit] (odds if won, 1 if void, 0 if lost), summed over the cells. */
function joint(legs: TicketLeg[], cells: Cell[]) {
  let p = 0;
  let ret = 0;
  for (const c of cells) {
    let factor = 1;
    let lost = false;
    for (const l of legs) {
      const r = settleKey(l.key, c.hg, c.ag, c.hc, c.ac);
      if (r === "LOST") {
        lost = true;
        break;
      }
      if (r === "WON") factor *= l.odds ?? 1;
    }
    if (lost) continue;
    p += c.w;
    ret += c.w * factor;
  }
  return { p, ret };
}

interface Part {
  p: number;
  ret: number;
  /** Probability from the raw model, before shrinking toward the market. Used to detect contradictions. */
  modelP: number;
}

/**
 * Legs of one kind (goals or corners) in one match. The joint comes from the raw model; it is
 * then scaled by prod(prob / modelProb) so a lone leg keeps its blended probability and the
 * correlation the model sees is kept on top of the blend.
 */
function part(legs: TicketLeg[], cells: () => Cell[] | null): Part {
  if (legs.length === 0) return { p: 1, ret: 1, modelP: 1 };
  if (legs.length === 1 && !voidable(legs[0].key)) {
    const l = legs[0];
    return { p: l.prob, ret: l.prob * (l.odds ?? 1), modelP: l.modelProb };
  }
  const cs = cells();
  if (!cs) {
    // No model for this match: fall back to independence.
    return legs.reduce((a, l) => ({ p: a.p * l.prob, ret: a.ret * l.prob * (l.odds ?? 1), modelP: a.modelP * l.modelProb }), { p: 1, ret: 1, modelP: 1 });
  }
  const j = joint(legs, cs);
  const scale = legs.reduce((s, l) => s * (l.modelProb > 0 ? l.prob / l.modelProb : 1), 1);
  const cap = Math.min(1, ...legs.filter((l) => !voidable(l.key)).map((l) => l.prob));
  return { p: Math.min(cap, j.p * scale), ret: j.ret * scale, modelP: j.p };
}

export interface MatchGroup {
  matchId: string;
  legs: TicketLeg[];
  /** Two or more legs: the joint probability is used instead of the product. */
  correlated: boolean;
  /** P(no leg of this match loses). */
  prob: number;
  /** What multiplying the legs would have given. */
  naiveProb: number;
  /** Pairs of legs (by legId) that cannot both win. */
  contradictions: [string, string][];
}

export interface TicketMath {
  prob: number;
  totalOdds: number | null;
  /** Expected return per unit staked; equals prob x totalOdds when no leg can be void. */
  expectedReturn: number | null;
  ev: number | null;
  margin: number | null;
  groups: MatchGroup[];
  contradictory: boolean;
  missingOdds: TicketLeg[];
}

function groupMath(legs: TicketLeg[]) {
  const model = legs.find((l) => l.model)?.model ?? null;
  const goals = part(legs.filter((l) => !isCornerKey(l.key)), () => (model ? goalCells(model) : null));
  const corners = part(legs.filter((l) => isCornerKey(l.key)), () => (model ? cornerCells(model) : null));
  // Goals and corners of the same match are treated as independent.
  return { p: goals.p * corners.p, ret: goals.ret * corners.ret, modelP: goals.modelP * corners.modelP };
}

function contradictions(legs: TicketLeg[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < legs.length; i++)
    for (let j = i + 1; j < legs.length; j++)
      if (groupMath([legs[i], legs[j]]).modelP < CONTRADICTION) out.push([legId(legs[i]), legId(legs[j])]);
  return out;
}

/** Win probability, odds, EV and margin of an accumulator. Pure: no React, no database. */
export function ticketMath(legs: TicketLeg[]): TicketMath {
  const byMatch = new Map<string, TicketLeg[]>();
  for (const l of legs) byMatch.set(l.matchId, [...(byMatch.get(l.matchId) ?? []), l]);

  const missingOdds = legs.filter((l) => !(l.odds != null && l.odds > 1));
  const groups: MatchGroup[] = [];
  let prob = 1;
  let ret = 1;
  for (const [matchId, ls] of Array.from(byMatch.entries())) {
    const g = groupMath(ls);
    // Different matches are independent: multiply.
    prob *= g.p;
    ret *= g.ret;
    const pairs = ls.length > 1 ? contradictions(ls) : [];
    groups.push({
      matchId,
      legs: ls,
      correlated: ls.length > 1,
      prob: g.p,
      naiveProb: ls.reduce((a, l) => a * l.prob, 1),
      contradictions: g.modelP < CONTRADICTION && pairs.length === 0 && ls.length > 1 ? [[legId(ls[0]), legId(ls[1])]] : pairs,
    });
  }

  const hasOdds = legs.length > 0 && missingOdds.length === 0;
  const totalOdds = hasOdds ? legs.reduce((a, l) => a * l.odds!, 1) : null;
  const withMargin = legs.filter((l) => l.overround != null);
  return {
    prob: legs.length ? prob : 0,
    totalOdds,
    expectedReturn: hasOdds ? ret : null,
    ev: hasOdds ? ret - 1 : null,
    margin: withMargin.length ? withMargin.reduce((a, l) => a * (1 + l.overround!), 1) - 1 : null,
    groups,
    contradictory: groups.some((g) => g.contradictions.length > 0),
    missingOdds,
  };
}

/** Edge of a leg played as a single. */
export const legEdge = (l: TicketLeg) => (l.odds != null && l.odds > 1 ? l.prob * l.odds - 1 : null);

export type RiskLevel = "low" | "medium" | "high" | "veryHigh";
export const RISK_ORDER: RiskLevel[] = ["low", "medium", "high", "veryHigh"];

export function riskLevel(p: number): RiskLevel {
  if (p >= 0.5) return "low";
  if (p >= 0.25) return "medium";
  if (p >= 0.1) return "high";
  return "veryHigh";
}

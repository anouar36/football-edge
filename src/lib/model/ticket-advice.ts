import { dictionaries, type Locale } from "../i18n";
import { ltr, money } from "../utils";
import { marketLabel } from "./markets";
import { legEdge, legId, ticketMath, type TicketLeg, type TicketMath } from "./ticket";
import { stakeFor, type StakeRules } from "./value";

export type TipTone = "good" | "warn" | "danger";
export type TipAction = { kind: "remove"; legId: string } | { kind: "add"; leg: TicketLeg } | { kind: "stake"; amount: number };
export interface Tip {
  id: string;
  tone: TipTone;
  text: string;
  action?: TipAction;
}

export const QUICK_STAKES = [10, 50, 100];
/** Suggested when the maths says not to play: the smallest quick stake. */
export const MIN_STAKE = QUICK_STAKES[0];
/** No "add a pick" suggestion once the ticket is this long. */
const MAX_LEGS = 4;

export interface AdviceInput {
  legs: TicketLeg[];
  /** Null = the suggested stake. */
  stake: number | null;
  name: string;
  locale: Locale;
  rules: StakeRules;
  currency: string;
  /** Today's open value picks (from upcomingPicks), as legs. */
  suggestions: TicketLeg[];
}

export interface Advice {
  math: TicketMath;
  tips: Tip[];
  /** Kelly stake for the whole ticket; when Kelly is 0, MIN_STAKE capped by the max stake per bet. */
  suggestedStake: number;
  kelly: number;
}

const TONE_ORDER: Record<TipTone, number> = { danger: 0, warn: 1, good: 2 };

/** Instant rule-based tips for a ticket. Pure: no React, no API call. */
export function ticketAdvice({ legs, stake, name, locale, rules, currency, suggestions }: AdviceInput): Advice {
  const math = ticketMath(legs);
  if (!legs.length) return { math, tips: [], suggestedStake: 0, kelly: 0 };

  const t = dictionaries[locale].tickets.advice;
  const verdicts = dictionaries[locale].verdict;
  const label = (l: Pick<TicketLeg, "key" | "home" | "away">) => marketLabel(l.key, l.home, l.away, locale);
  const fixture = (l: TicketLeg) => `${l.home} – ${l.away}`;
  const chance = (x: number) => ltr(`${(x * 100).toFixed(x > 0 && x < 0.1 ? 1 : 0)}%`);
  const signedPct = (x: number) => ltr(`${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`);
  const cash = (x: number) => ltr(`${x < 0 ? "−" : ""}${money(Math.abs(x), currency)}`);
  const byId = new Map(legs.map((l) => [legId(l), l]));
  const tips: Tip[] = [];

  // Stake: fractional Kelly on the whole ticket, capped by maxStakePct. Kelly takes the probability that
  // gives the ticket's expected return (P(win) for a plain ticket): with a void-able leg, P(no leg loses)
  // also counts refunds as wins and would suggest a stake on a ticket that loses money on average.
  const kellyStake =
    math.totalOdds != null && math.expectedReturn != null && !math.contradictory ? stakeFor(math.expectedReturn / math.totalOdds, math.totalOdds, rules) : null;
  // The smallest quick stake, but never above the max stake per bet (a small bankroll caps it lower).
  const minStake = Math.max(0.01, Math.min(MIN_STAKE, Math.floor(rules.bankroll * rules.maxStakePct * 100) / 100));
  const suggestedStake = kellyStake && kellyStake.kelly > 0 && kellyStake.stake > 0 ? kellyStake.stake : minStake;
  stake ??= suggestedStake;

  // Legs of one match that cannot all win.
  for (const g of math.groups)
    for (const [a, b] of g.contradictions)
      tips.push({ id: `contra:${a}:${b}`, tone: "danger", text: t.contradiction(name, label(byId.get(a)!), label(byId.get(b)!)), action: { kind: "remove", legId: b } });

  // Long tickets: every leg adds the bookmaker's margin again.
  if (!math.contradictory && (legs.length > MAX_LEGS || math.prob < 0.1))
    tips.push({ id: "longshot", tone: "danger", text: t.longShot(name, ltr(legs.length), chance(math.prob), math.margin != null ? signedPct(math.margin) : null) });

  // The leg with the most negative edge.
  const worst = legs
    .map((l) => ({ l, e: legEdge(l) }))
    .filter((x): x is { l: TicketLeg; e: number } => x.e != null && x.e < 0)
    .sort((a, b) => a.e - b.e)[0];
  if (worst && legs.length > 1) {
    const without = ticketMath(legs.filter((l) => l !== worst.l));
    tips.push({
      id: `worst:${legId(worst.l)}`,
      tone: "warn",
      text: t.negativeEdge(name, label(worst.l), signedPct(worst.e), chance(without.prob), chance(math.prob), without.ev != null ? signedPct(without.ev) : null),
      action: { kind: "remove", legId: legId(worst.l) },
    });
  }

  // Negative expected value, compared with the positive-value legs played as singles.
  if (math.ev != null && math.ev < 0) {
    const ticketProfit = stake * math.ev;
    let text = t.negativeEv(name, signedPct(math.ev), cash(ticketProfit), cash(stake));
    if (legs.length > 1) {
      const positive = legs.filter((l) => (legEdge(l) ?? -1) > 0);
      const singles = positive.reduce((s, l) => s + (stake / positive.length) * legEdge(l)!, 0);
      text += ` ${positive.length ? t.singles(ltr(positive.length), cash(singles), cash(ticketProfit)) : t.noValueLegs}`;
    }
    tips.push({ id: "negev", tone: "danger", text });
  }

  // Same-match legs: correlated, so the joint probability replaces the product.
  for (const g of math.groups)
    if (g.correlated && !g.contradictions.length)
      tips.push({ id: `corr:${g.matchId}`, tone: "warn", text: t.correlated(g.legs.map(label), fixture(g.legs[0]), chance(g.prob), chance(g.naiveProb)) });

  if (math.missingOdds.length) {
    const more = math.missingOdds.length - 1;
    tips.push({ id: "odds", tone: "warn", text: t.missingOdds(name, label(math.missingOdds[0]), more > 0 ? ltr(more) : null) });
  }

  // AI review flags, once per match.
  const reviewed = new Set<string>();
  for (const l of legs) {
    if (!l.review || reviewed.has(l.matchId)) continue;
    reviewed.add(l.matchId);
    const pick = l.review.pickKey !== l.key ? label({ ...l, key: l.review.pickKey }) : null;
    tips.push({
      id: `review:${l.matchId}`,
      tone: l.review.verdict === "AVOID" ? "danger" : "warn",
      text: t.aiReview(label(l), fixture(l), verdicts[l.review.verdict], l.review.headline, pick),
      action: l.review.verdict === "AVOID" && !pick ? { kind: "remove", legId: legId(l) } : undefined,
    });
  }

  // The open value pick that would raise the ticket's EV the most.
  if (math.ev != null && !math.contradictory && legs.length < MAX_LEGS) {
    let best: { leg: TicketLeg; next: TicketMath } | null = null;
    for (const s of suggestions) {
      if (byId.has(legId(s)) || s.odds == null) continue;
      const next = ticketMath([...legs, s]);
      if (next.ev == null || next.ev <= math.ev || next.prob < 0.1 || next.contradictory) continue;
      if (!best || next.ev > best.next.ev!) best = { leg: s, next };
    }
    if (best)
      tips.push({
        id: `add:${legId(best.leg)}`,
        tone: "good",
        text: t.addPick(name, label(best.leg), fixture(best.leg), ltr(best.leg.odds!.toFixed(2)), signedPct(legEdge(best.leg)!), signedPct(math.ev), signedPct(best.next.ev!), chance(math.prob), chance(best.next.prob)),
        action: { kind: "add", leg: best.leg },
      });
  }

  if (kellyStake) {
    const s = kellyStake;
    if (s.kelly > 0 && s.stake > 0) {
      const capped = rules.kellyFraction * s.kelly > rules.maxStakePct;
      tips.push({
        id: "stake",
        tone: "good",
        text: t.stake(cash(s.stake), ltr(`${(s.stakePct * 100).toFixed(2)}%`), ltr(rules.kellyFraction), capped ? ltr(`${(rules.maxStakePct * 100).toFixed(1)}%`) : null),
        action: { kind: "stake", amount: s.stake },
      });
    } else {
      tips.push({ id: "nokelly", tone: "danger", text: t.noKelly(name, cash(minStake)), action: { kind: "stake", amount: minStake } });
    }
  }

  if (math.ev != null && math.ev > 0 && !math.contradictory && math.prob >= 0.1 && legs.length <= MAX_LEGS)
    tips.push({ id: "positive", tone: "good", text: t.positive(name, signedPct(math.ev), chance(math.prob)) });

  tips.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
  return { math, tips, suggestedStake, kelly: kellyStake?.kelly ?? 0 };
}

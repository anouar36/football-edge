/** About the smallest bet most bookmakers accept (in MAD, the default currency). A smaller stake cannot really be placed. */
export const MIN_BET = 10;

type Rules = { bankroll: number; maxStakePct: number };

/** The largest stake one bet may use: maxStakePct of the bankroll. */
export const maxStake = (s: Rules) => Math.max(0, s.bankroll) * s.maxStakePct;

/** A stored stake above today's cap (sized from an earlier, larger bankroll). One cent of rounding is allowed. */
export const aboveMax = (stake: number, s: Rules) => stake > maxStake(s) + 0.01;

export function bankrollIssues(s: Rules, stakes: number[] = []) {
  return {
    notPositive: !(s.bankroll > 0),
    tooSmall: s.bankroll > 0 && maxStake(s) < MIN_BET,
    /** Share of the bankroll the open stakes add up to, when one of them is above the cap. */
    overStaked: s.bankroll > 0 && stakes.some((x) => aboveMax(x, s)) ? stakes.reduce((a, b) => a + b, 0) / s.bankroll : null,
  };
}

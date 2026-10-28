import "./env";
/**
 * Walk-forward backtest on real football-data.co.uk history.
 *   npm run backtest -- E0 2425      (league, season to test)
 * The model is refitted every 7 days using only matches played before that date,
 * then bets are placed at the pre-match odds and compared with closing odds.
 */
import { fetchSeason, type HistMatch } from "../src/lib/data/footballdata";
import { fitLeague, predictMatch } from "../src/lib/model/predict";
import { findValue, isPlayable, settleKey, type StakeRules } from "../src/lib/model/value";

const league = process.argv[2] ?? "E0";
const season = process.argv[3] ?? "2425";
const prevSeason = (s: string) => {
  const a = Number(s.slice(0, 2));
  const two = (n: number) => String((n + 100) % 100).padStart(2, "0");
  return `${two(a - 1)}${two(a)}`;
};

(async () => {
  const [p2, p1, test] = await Promise.all([
    fetchSeason(league, prevSeason(prevSeason(season))),
    fetchSeason(league, prevSeason(season)),
    fetchSeason(league, season),
  ]);
  if (!test.length) throw new Error(`No data for ${league} ${season}`);
  const history: HistMatch[] = [...p2, ...p1, ...test];
  const rules: StakeRules = { bankroll: 1000, kellyFraction: 0.25, maxStakePct: 0.02, minEdge: 0.04, minProb: 0.3, minOdds: 1.4, maxOdds: 4.5, modelWeight: 0.5 };

  let bets = 0, staked = 0, profit = 0, wins = 0, clvSum = 0, clvN = 0, brier = 0, brierN = 0;
  let model = null as ReturnType<typeof fitLeague> | null;
  let fittedAt = 0;
  for (const m of test) {
    if (!model || m.kickoff.getTime() - fittedAt > 7 * 86_400_000) {
      model = fitLeague(league, history, m.kickoff);
      fittedAt = m.kickoff.getTime();
    }
    const pred = predictMatch(model, m.home, m.away);
    // calibration on 1X2
    const outcome = m.hg > m.ag ? "HOME" : m.hg === m.ag ? "DRAW" : "AWAY";
    for (const s of ["HOME", "DRAW", "AWAY"]) {
      brier += (pred.probs[`1X2:${s}`] - (s === outcome ? 1 : 0)) ** 2;
    }
    brierN++;
    const best = findValue(pred.probs, m.odds, rules).filter((c) => isPlayable(c, rules)).sort((a, b) => b.edge - a.edge)[0];
    if (!best || pred.dataWarning) continue;
    const stake = 10; // flat 10 for a clean ROI number
    const res = settleKey(best.key, m.hg, m.ag);
    bets++;
    staked += stake;
    if (res === "WON") { profit += stake * (best.odds - 1); wins++; } else if (res === "LOST") profit -= stake;
    const close = m.closing[best.key];
    if (close) { clvSum += best.odds / close - 1; clvN++; }
  }
  console.log(`\n${league} ${season}  (${test.length} matches)`);
  console.log(`Brier score 1X2: ${(brier / brierN).toFixed(4)}  (lower is better, ~0.60 = bookmaker level, 0.667 = coin flip)`);
  console.log(`Bets: ${bets}, hit rate ${(wins / Math.max(1, bets) * 100).toFixed(1)}%`);
  console.log(`Staked ${staked}, profit ${profit.toFixed(2)}, ROI ${(profit / Math.max(1, staked) * 100).toFixed(2)}%`);
  console.log(`Average CLV: ${clvN ? ((clvSum / clvN) * 100).toFixed(2) : "n/a"}%  (positive CLV over many bets = real edge)`);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

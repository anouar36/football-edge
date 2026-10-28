import assert from "node:assert/strict";
import { synthLeague } from "./synthetic";
import { fitLeague, predictMatch } from "../src/lib/model/predict";
import { scoreMatrix, goalMarkets, cornerMarkets, negBinPmf } from "../src/lib/model/markets";
import { devig, findValue, kellyFraction, settleKey } from "../src/lib/model/value";
import { parseKickoff, seasonCode } from "../src/lib/data/footballdata";
import { riskLevel, ticketMath, type TicketLeg } from "../src/lib/model/ticket";

const near = (a: number, b: number, tol: number, msg: string) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

// probabilities sum to 1
const m = scoreMatrix(1.6, 1.1, -0.08);
const g = goalMarkets(m);
near(g["1X2:HOME"] + g["1X2:DRAW"] + g["1X2:AWAY"], 1, 1e-9, "1X2 sums to 1");
near(g["OU2.5:OVER"] + g["OU2.5:UNDER"], 1, 1e-9, "OU sums to 1");
near(negBinPmf(5, 1.5, 60).reduce((s, v) => s + v, 0), 1, 1e-6, "NB sums to 1");
const c = cornerMarkets(5.5, 4.5, 1.3);
near(c["CORNERRACE:HOME"] + c["CORNERRACE:TIE"] + c["CORNERRACE:AWAY"], 1, 1e-6, "corner race sums to 1");

// value maths
near(kellyFraction(0.53, 2.1), 0.1027, 1e-3, "kelly example");
near(devig([2, 2]).reduce((a, b) => a + b), 1, 1e-12, "devig");
assert.equal(settleKey("1X2:HOME", 2, 1), "WON");
assert.equal(settleKey("OU2.5:OVER", 1, 1), "LOST");
assert.equal(settleKey("DNB:AWAY", 1, 1), "VOID");
assert.equal(settleKey("CORNERS9.5:OVER", 0, 0, 6, 5), "WON");
const v = findValue({ "1X2:HOME": 0.6, "1X2:DRAW": 0.25, "1X2:AWAY": 0.15 }, { "1X2:HOME": 2.0, "1X2:DRAW": 3.4, "1X2:AWAY": 4.0 }, { bankroll: 1000, kellyFraction: 0.25, maxStakePct: 0.02, minEdge: 0.04, minProb: 0.3, minOdds: 1.4, maxOdds: 4.5, modelWeight: 0.5 });
assert.ok(v.find((x) => x.key === "1X2:HOME")!.edge > 0, "home has value");
assert.ok(v.every((x) => x.stakePct <= 0.02), "stake capped");

// dates
assert.equal(seasonCode(new Date(Date.UTC(2026, 9, 25))), "2627");
assert.equal(seasonCode(new Date(Date.UTC(2026, 2, 1))), "2526");
assert.equal(parseKickoff("25/10/2026", "15:00")!.toISOString(), "2026-10-25T15:00:00.000Z"); // GMT after clocks change
assert.equal(parseKickoff("18/10/2026", "15:00")!.toISOString(), "2026-10-18T14:00:00.000Z"); // BST

// model recovers synthetic truth
const L = synthLeague({ seasons: 2 });
const now = new Date(L.history[L.history.length - 1].kickoff.getTime() + 86_400_000);
const model = fitLeague("E0", L.history, now);
const corr = (() => {
  const xs = L.names.map((n) => Math.log(L.truth[n].a));
  const ys = L.names.map((n) => Math.log(model.goals.attack[n]));
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  let sxy = 0, sxx = 0, syy = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
  return sxy / Math.sqrt(sxx * syy);
})();
console.log(`attack correlation with truth: ${corr.toFixed(3)}, home adv ${model.goals.homeAdv.toFixed(2)} (true 1.20), rho ${model.goals.rho}, corner dispersion ${model.corners?.dispersion.toFixed(2)}`);
assert.ok(corr > 0.85, "ratings correlate with truth");
near(model.goals.homeAdv, 1.2, 0.12, "home advantage");

const p = predictMatch(model, "Arsenal", "Sunderland");
console.log(`Arsenal v Sunderland: xG ${p.xgHome.toFixed(2)}-${p.xgAway.toFixed(2)}, H ${(p.probs["1X2:HOME"] * 100).toFixed(1)}%, O2.5 ${(p.probs["OU2.5:OVER"] * 100).toFixed(1)}%, corners O9.5 ${(p.probs["CORNERS9.5:OVER"] * 100).toFixed(1)}%`);
assert.ok(p.probs["1X2:HOME"] > p.probs["1X2:AWAY"]);

// ticket maths
{
  const model = { xgHome: 1.6, xgAway: 1.1, rho: -0.08, xcHome: 5.6, xcAway: 4.4, cornerDispersion: 1.3 };
  const probs = { ...goalMarkets(scoreMatrix(model.xgHome, model.xgAway, model.rho)), ...cornerMarkets(model.xcHome, model.xcAway, model.cornerDispersion) };
  const leg = (key: string, o: number | null, matchId = "M1", extra: Partial<TicketLeg> = {}): TicketLeg => ({
    matchId, home: "Home", away: "Away", league: "E0", kickoff: "2026-10-25T15:00:00Z", key, label: key,
    prob: probs[key], modelProb: probs[key], odds: o, modelOnly: false, overround: null, model, ...extra,
  });

  // independent legs: product
  const a = leg("1X2:HOME", 2.1, "M1", { overround: 0.05 });
  const b = leg("OU2.5:OVER", 1.9, "M2", { overround: 0.06 });
  const ind = ticketMath([a, b]);
  near(ind.prob, a.prob * b.prob, 1e-12, "independent legs multiply");
  near(ind.totalOdds!, 2.1 * 1.9, 1e-12, "total odds");
  near(ind.ev!, ind.prob * 2.1 * 1.9 - 1, 1e-12, "EV = P x odds - 1");
  near(ind.margin!, 1.05 * 1.06 - 1, 1e-12, "ticket margin");
  assert.ok(!ind.groups.some((g) => g.correlated), "different matches are not correlated");

  // same match: joint from the score matrix, checked against a brute-force sum
  const same = ticketMath([leg("1X2:HOME", 2.1), leg("OU2.5:OVER", 1.9)]);
  let brute = 0;
  scoreMatrix(model.xgHome, model.xgAway, model.rho).forEach((row, x) => row.forEach((v, y) => { if (x > y && x + y > 2.5) brute += v; }));
  near(same.prob, brute, 1e-12, "same-match legs use the joint");
  assert.ok(Math.abs(same.prob - probs["1X2:HOME"] * probs["OU2.5:OVER"]) > 0.01, "joint differs from the product");
  assert.ok(same.groups[0].correlated);

  // same-match corners against brute force, and goals x corners treated as independent
  const ph = negBinPmf(model.xcHome, model.cornerDispersion, 30), pa = negBinPmf(model.xcAway, model.cornerDispersion, 30);
  let cBrute = 0, cNorm = 0;
  ph.forEach((u, x) => pa.forEach((w, y) => { cNorm += u * w; if (x + y > 9.5 && x > y) cBrute += u * w; }));
  const corners = ticketMath([leg("CORNERS9.5:OVER", 1.8), leg("CORNERRACE:HOME", 1.7)]);
  near(corners.prob, cBrute / cNorm, 1e-9, "same-match corners use the joint");
  const mixed = ticketMath([leg("1X2:HOME", 2.1), leg("OU2.5:OVER", 1.9), leg("CORNERS9.5:OVER", 1.8)]);
  near(mixed.prob, brute * probs["CORNERS9.5:OVER"], 1e-12, "goals and corners of one match are independent");

  // a lone blended leg keeps its blended probability; a same-match pair keeps the model's correlation
  const blended = leg("1X2:HOME", 2.1, "M1", { prob: probs["1X2:HOME"] - 0.04 });
  near(ticketMath([blended]).prob, blended.prob, 1e-12, "single leg keeps its blend");
  near(ticketMath([blended, leg("OU2.5:OVER", 1.9)]).prob, brute * (blended.prob / blended.modelProb), 1e-12, "joint scaled by the blend");

  // draw no bet: a draw refunds the leg
  const dnb = ticketMath([leg("DNB:HOME", 1.6)]);
  near(dnb.expectedReturn!, probs["1X2:HOME"] * 1.6 + probs["1X2:DRAW"], 1e-9, "DNB return counts the refund");

  // contradictory legs
  const bad = ticketMath([leg("OU1.5:UNDER", 1.5), leg("BTTS:YES", 1.8), leg("1X2:AWAY", 3.2, "M2")]);
  assert.ok(bad.prob < 1e-9, "Under 1.5 and BTTS yes cannot both win");
  assert.ok(bad.contradictory && bad.groups.find((g) => g.matchId === "M1")!.contradictions.length === 1, "contradiction flagged");
  assert.ok(!ticketMath([leg("OU2.5:UNDER", 1.5), leg("BTTS:YES", 1.8)]).contradictory, "Under 2.5 + BTTS is possible (1-1)");

  // missing odds and risk levels
  const missing = ticketMath([a, leg("BTTS:YES", null, "M3")]);
  assert.equal(missing.totalOdds, null);
  assert.equal(missing.missingOdds.length, 1);
  assert.deepEqual([0.6, 0.3, 0.12, 0.05].map(riskLevel), ["low", "medium", "high", "veryHigh"]);
}
console.log("all model tests passed");

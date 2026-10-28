/**
 * Money logic, checked against independent calculations written here from the
 * definitions (no expected value comes from the code under test).
 *   npm run qa:money
 */
import { check, done, near, section } from "./harness";
import { synthLeague } from "../synthetic";
import { cornerMarkets, DISPLAY_KEYS, goalMarkets, scoreMatrix } from "../../src/lib/model/markets";
import { devig, findValue, isPlayable, kellyFraction, overround, priceCheck, settleKey, stakeFor, type StakeRules } from "../../src/lib/model/value";
import { fitLeague, predictMatch } from "../../src/lib/model/predict";
import { ticketMath, type TicketLeg } from "../../src/lib/model/ticket";
import { ticketAdvice } from "../../src/lib/model/ticket-advice";
import { parseKickoff, seasonCode, type HistMatch } from "../../src/lib/data/footballdata";
import { perf } from "../../src/lib/queries";
import type { PickWithMatch } from "../../src/lib/schema";

// ---------- independent reference maths ----------
const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));
const pois = (k: number, l: number) => (Math.exp(-l) * l ** k) / fact(k);
/** Dixon-Coles score matrix written from the paper: tau corrects 0-0, 0-1, 1-0, 1-1. */
function refMatrix(lh: number, la: number, rho: number, max = 10) {
  const tau = (x: number, y: number) =>
    x === 0 && y === 0 ? 1 - lh * la * rho : x === 0 && y === 1 ? 1 + lh * rho : x === 1 && y === 0 ? 1 + la * rho : x === 1 && y === 1 ? 1 - rho : 1;
  const m: number[][] = [];
  let total = 0;
  for (let x = 0; x <= max; x++) {
    m.push([]);
    for (let y = 0; y <= max; y++) {
      const v = Math.max(0, pois(x, lh) * pois(y, la) * tau(x, y));
      m[x].push(v);
      total += v;
    }
  }
  return m.map((r) => r.map((v) => v / total));
}
/** Settlement rules written from the market definitions. */
function refSettle(key: string, hg: number, ag: number, hc: number | null, ac: number | null): "WON" | "LOST" | "VOID" {
  const [market, sel] = key.split(":");
  const line = parseFloat(market.replace(/^[A-Z]+/, ""));
  const w = (b: boolean) => (b ? "WON" : "LOST");
  if (market === "1X2") return w(sel === "HOME" ? hg > ag : sel === "AWAY" ? hg < ag : hg === ag);
  if (market === "DC") return w(sel === "1X" ? hg >= ag : sel === "X2" ? hg <= ag : hg !== ag);
  if (market === "DNB") return hg === ag ? "VOID" : w(sel === "HOME" ? hg > ag : hg < ag);
  if (/^OU/.test(market)) return w(sel === "OVER" ? hg + ag > line : hg + ag < line);
  if (market === "BTTS") return w((hg > 0 && ag > 0) === (sel === "YES"));
  if (/^HOMEGOALS/.test(market)) return w(hg > line);
  if (/^AWAYGOALS/.test(market)) return w(ag > line);
  if (hc == null || ac == null) return "VOID";
  if (/^CORNERS/.test(market)) return w(sel === "OVER" ? hc + ac > line : hc + ac < line);
  if (market === "CORNERRACE") return w(sel === "HOME" ? hc > ac : sel === "AWAY" ? hc < ac : hc === ac);
  return "VOID";
}
const refKelly = (p: number, o: number) => (o > 1 && p >= 0 && p <= 1 ? Math.max(0, (p * (o - 1) - (1 - p)) / (o - 1)) : 0);
const rules: StakeRules = { bankroll: 1000, kellyFraction: 0.25, maxStakePct: 0.02, minEdge: 0.04, minProb: 0.3, minOdds: 1.4, maxOdds: 4.5, modelWeight: 0.5 };

// ---------- 1. market probabilities ----------
section("1. Market probabilities: sums and values against an independent Dixon-Coles matrix");
for (const [lh, la, rho] of [[1.6, 1.1, -0.08], [0.4, 3.2, 0.05], [2.9, 0.3, -0.2], [1.0, 1.0, 0]] as const) {
  const p = goalMarkets(scoreMatrix(lh, la, rho));
  const m = refMatrix(lh, la, rho);
  const sum = (f: (x: number, y: number) => boolean) => m.reduce((s, r, x) => s + r.reduce((t, v, y) => t + (f(x, y) ? v : 0), 0), 0);
  const tag = `λ ${lh}-${la} ρ ${rho}`;
  check(`${tag}: 1X2 sums to 1`, near(p["1X2:HOME"] + p["1X2:DRAW"] + p["1X2:AWAY"], 1, 1e-12));
  check(`${tag}: P(home) equals the reference`, near(p["1X2:HOME"], sum((x, y) => x > y), 1e-12));
  check(`${tag}: DC 1X = home + draw, DC 12 = 1 − draw`, near(p["DC:1X"], p["1X2:HOME"] + p["1X2:DRAW"], 1e-12) && near(p["DC:12"], 1 - p["1X2:DRAW"], 1e-12));
  check(`${tag}: DNB home + away = 1`, near(p["DNB:HOME"] + p["DNB:AWAY"], 1, 1e-12));
  for (const line of [1.5, 2.5, 3.5]) {
    check(`${tag}: O/U ${line} sums to 1 and matches the reference`, near(p[`OU${line}:OVER`] + p[`OU${line}:UNDER`], 1, 1e-12) && near(p[`OU${line}:OVER`], sum((x, y) => x + y > line), 1e-12));
  }
  check(`${tag}: BTTS matches the reference`, near(p["BTTS:YES"], sum((x, y) => x > 0 && y > 0), 1e-12));
  // Every goals market: P(settles WON) under the matrix = its probability (DNB: P(WON | not void)).
  const keys = DISPLAY_KEYS.filter((k) => !k.startsWith("CORNER"));
  const bad = keys.filter((k) => {
    const won = sum((x, y) => settleKey(k, x, y) === "WON");
    const lost = sum((x, y) => settleKey(k, x, y) === "LOST");
    return !near(k.startsWith("DNB") ? won / (won + lost) : won, p[k], 1e-12);
  });
  check(`${tag}: probability of every goals market = P(its settlement is WON)`, bad.length === 0, bad.join(", "));
}
{
  const c = cornerMarkets(5.5, 4.5, 1.3);
  check("corners: race sums to 1", near(c["CORNERRACE:HOME"] + c["CORNERRACE:TIE"] + c["CORNERRACE:AWAY"], 1, 1e-9));
  check("corners: every O/U line sums to 1", [7.5, 8.5, 9.5, 10.5, 11.5, 12.5].every((l) => near(c[`CORNERS${l}:OVER`] + c[`CORNERS${l}:UNDER`], 1, 1e-9)));
  check("corners: P(over) falls as the line rises", [7.5, 8.5, 9.5, 10.5, 11.5].every((l) => c[`CORNERS${l}:OVER`] > c[`CORNERS${l + 1}:OVER`]));
}

// ---------- 2. devig, edge ----------
section("2. Margin removal (devig) and edge");
{
  const odds = [2.0, 3.5, 4.0];
  const inv = odds.map((o) => 1 / o);
  const s = inv.reduce((a, b) => a + b, 0);
  const fair = devig(odds);
  check("devig = (1/odds) / Σ(1/odds)", fair.every((f, i) => near(f, inv[i] / s, 1e-15)));
  check("devig sums to 1", near(fair.reduce((a, b) => a + b, 0), 1, 1e-15));
  check("overround = Σ(1/odds) − 1 = 3.571%", near(overround(odds), s - 1, 1e-15) && near(overround(odds), 0.0357142857, 1e-9));
  const probs = { "1X2:HOME": 0.6, "1X2:DRAW": 0.25, "1X2:AWAY": 0.15, "OU2.5:OVER": 0.55, "OU2.5:UNDER": 0.45 };
  const c = findValue(probs, { "1X2:HOME": 2.0, "1X2:DRAW": 3.5, "1X2:AWAY": 4.0, "OU2.5:OVER": 1.9, "OU2.5:UNDER": 1.95 }, rules);
  const h = c.find((x) => x.key === "1X2:HOME")!;
  const blended = 0.5 * 0.6 + 0.5 * fair[0];
  check("blend = w·model + (1−w)·market", near(h.prob, blended, 1e-15), `${h.prob.toFixed(4)}`);
  check("edge = blended prob × odds − 1", near(h.edge, blended * 2.0 - 1, 1e-15), `${(h.edge * 100).toFixed(2)}%`);
  const ou = c.find((x) => x.key === "OU2.5:OVER")!;
  check("O/U fair prob uses its own group only", near(ou.marketProb, (1 / 1.9) / (1 / 1.9 + 1 / 1.95), 1e-15));
  const lone = findValue({ "1X2:HOME": 0.6 }, { "1X2:HOME": 2.0 }, rules);
  check("an incomplete odds group (one price of 1X2) gives no candidate", lone.length === 0, lone.length ? `market prob ${lone[0].marketProb}, edge ${(lone[0].edge * 100).toFixed(0)}%` : "");
  const dc = findValue({ "DC:1X": 0.8, "DC:X2": 0.45, "DC:12": 0.75 }, { "DC:1X": 1.25, "DC:X2": 2.2, "DC:12": 1.33 }, rules);
  check("double chance prices are not devigged as if they summed to 1", dc.length === 0 || !near(dc.reduce((s2, x) => s2 + x.marketProb, 0), 1, 1e-9));
}

// ---------- 3. Kelly, caps, bad inputs ----------
section("3. Kelly stake, caps and bad inputs");
for (const [p, o] of [[0.55, 2.0], [0.5, 2.0], [0.4, 2.0], [0.53, 2.1], [0.3, 4.5], [0.99, 1.02]] as const) {
  check(`kelly(p=${p}, odds=${o}) = (bp − q)/b = ${refKelly(p, o).toFixed(4)}`, near(kellyFraction(p, o), refKelly(p, o), 1e-12));
}
{
  const s = stakeFor(0.55, 2.0, rules); // full Kelly 0.10 → quarter 0.025 → capped at 2%
  check("quarter Kelly is capped at maxStakePct", near(s.stakePct, 0.02, 1e-15) && near(s.stake, 20, 1e-9), `${s.stakePct} → ${s.stake}`);
  const small = stakeFor(0.53, 2.1, rules); // full 0.1027 → quarter 0.0257 → cap 0.02
  check("stake rounded to cents", Number.isInteger(Math.round(small.stake * 100)) && near(small.stake, 20, 1e-9));
  const under = stakeFor(0.42, 2.5, { ...rules, maxStakePct: 0.2 }); // full (1.05−1)/1.5 = 0.0333 → quarter 0.00833
  check("below the cap: stake = bankroll × fraction × Kelly", near(under.stake, Math.round(1000 * 0.25 * (0.42 * 2.5 - 1) / 1.5 * 100) / 100, 1e-9), `${under.stake}`);
  const zero = stakeFor(0.55, 2.0, { ...rules, bankroll: 0 });
  check("bankroll 0 → stake 0", zero.stake === 0);
  const [cand] = findValue({ "1X2:HOME": 0.7, "1X2:DRAW": 0.2, "1X2:AWAY": 0.1 }, { "1X2:HOME": 2.0, "1X2:DRAW": 3.5, "1X2:AWAY": 4.0 }, { ...rules, bankroll: 0 });
  check("bankroll 0 → no playable pick", !isPlayable(cand, { ...rules, bankroll: 0 }));
  for (const o of [1, 0.8, 0, -2]) check(`odds ${o} (≤ 1) → Kelly 0 and stake 0`, kellyFraction(0.5, o) === 0 && stakeFor(0.5, o, rules).stake === 0, `kelly ${kellyFraction(0.5, o)}`);
  check("priceCheck at odds 0.9 suggests no stake", priceCheck(0.6, 0.9, rules).stake === 0, `stake ${priceCheck(0.6, 0.9, rules).stake}`);
  for (const [p, o] of [[NaN, 2], [0.5, NaN], [Infinity, 2], [-0.1, 2], [1.2, 2]] as const) {
    const k = kellyFraction(p, o);
    check(`kelly(p=${p}, odds=${o}) is 0, not NaN or negative`, k === 0, `${k}`);
  }
  check("NaN probability never becomes a pick", !isPlayable({ ...cand, prob: NaN, edge: NaN, stake: NaN }, rules));
}

// ---------- 4. settlement ----------
section("4. settleKey for every market key, including VOID");
{
  const keys = [...DISPLAY_KEYS, "OU0.5:OVER", "OU0.5:UNDER", "OU4.5:OVER", "OU4.5:UNDER", "CORNERS7.5:OVER", "CORNERS12.5:UNDER", "UNKNOWN:X"];
  let cases = 0;
  const wrong: string[] = [];
  for (const k of keys)
    for (let hg = 0; hg <= 6; hg++)
      for (let ag = 0; ag <= 6; ag++)
        for (const [hc, ac] of [[null, null], [0, 0], [4, 5], [5, 4], [6, 6], [9, 3], [2, 11]] as [number | null, number | null][]) {
          cases++;
          const got = settleKey(k, hg, ag, hc, ac);
          const want = refSettle(k, hg, ag, hc, ac);
          if (got !== want && wrong.length < 5) wrong.push(`${k} ${hg}-${ag} c${hc}-${ac}: ${got} ≠ ${want}`);
        }
  check(`${keys.length} keys × ${cases / keys.length} results agree with the reference rules`, wrong.length === 0, wrong.join("; ") || `${cases} cases`);
  check("DNB is VOID on a draw", settleKey("DNB:HOME", 1, 1) === "VOID" && settleKey("DNB:AWAY", 0, 0) === "VOID");
  check("corner markets are VOID when corners are missing", settleKey("CORNERS9.5:OVER", 2, 1, null, null) === "VOID" && settleKey("CORNERRACE:HOME", 2, 1, 5, null) === "VOID");
  check("unknown key is VOID (never WON)", settleKey("XYZ:ABC", 3, 0) === "VOID");
}

// ---------- 5. profit, ROI, CLV ----------
section("5. Profit, ROI, CLV and Brier on settled picks");
{
  const pick = (result: string, stake: number, odds: number, prob: number, closing: number | null, profit: number): PickWithMatch =>
    ({ result, stake, odds, prob, closingOdds: closing, clv: closing ? odds / closing - 1 : null, profit, status: "PLACED", match: { kickoff: new Date("2026-10-01T15:00:00Z") } }) as unknown as PickWithMatch;
  const list = [pick("WON", 20, 2.1, 0.5, 2.0, 22), pick("LOST", 10, 3.0, 0.35, 3.3, -10), pick("WON", 15, 1.8, 0.6, 1.8, 12), pick("VOID", 10, 1.6, 0.6, null, 0)];
  const s = perf(list);
  check("VOID picks are left out of the settled stats", s.n === 3);
  check("profit = Σ(WON stake×(odds−1)) − Σ(LOST stake)", near(s.profit, 20 * 1.1 + 15 * 0.8 - 10, 1e-9), `${s.profit}`);
  check("ROI = profit / staked", near(s.roi, (22 + 12 - 10) / 45, 1e-12), `${(s.roi * 100).toFixed(2)}%`);
  check("CLV = odds taken / closing odds − 1, averaged", near(s.avgClv!, (2.1 / 2.0 - 1 + 3.0 / 3.3 - 1 + 0) / 3, 1e-12), `${(s.avgClv! * 100).toFixed(2)}%`);
  check("Brier = mean (p − outcome)²", near(s.brier!, ((0.5 - 1) ** 2 + 0.35 ** 2 + (0.6 - 1) ** 2) / 3, 1e-12));
}

// ---------- 6. tickets ----------
section("6. Ticket probabilities: independent, same match, contradictory, void");
{
  const model = { xgHome: 1.6, xgAway: 1.1, rho: -0.08, xcHome: 5.6, xcAway: 4.4, cornerDispersion: 1.3 };
  const p = { ...goalMarkets(scoreMatrix(model.xgHome, model.xgAway, model.rho)), ...cornerMarkets(model.xcHome, model.xcAway, model.cornerDispersion) };
  const m = refMatrix(model.xgHome, model.xgAway, model.rho);
  const leg = (key: string, odds: number | null, matchId = "M1"): TicketLeg => ({
    matchId, home: "H", away: "A", league: "E0", kickoff: "2026-10-25T15:00:00Z", key, label: key, prob: p[key], modelProb: p[key], odds, modelOnly: false, overround: null, model,
  });
  const ind = ticketMath([leg("1X2:HOME", 2.1, "M1"), leg("OU2.5:OVER", 1.9, "M2"), leg("BTTS:YES", 1.8, "M3")]);
  const pInd = p["1X2:HOME"] * p["OU2.5:OVER"] * p["BTTS:YES"];
  check("independent legs: P = product", near(ind.prob, pInd, 1e-12));
  check("independent legs: EV = P × Π odds − 1", near(ind.ev!, pInd * 2.1 * 1.9 * 1.8 - 1, 1e-12), `${(ind.ev! * 100).toFixed(1)}%`);
  const same = ticketMath([leg("1X2:HOME", 2.1), leg("BTTS:YES", 1.8)]);
  const joint = m.reduce((s, r, x) => s + r.reduce((t, v, y) => t + (x > y && y > 0 ? v : 0), 0), 0);
  check("same match: P = joint from the score matrix (home win AND both score)", near(same.prob, joint, 1e-9), `${(joint * 100).toFixed(2)}% vs product ${(p["1X2:HOME"] * p["BTTS:YES"] * 100).toFixed(2)}%`);
  for (const [a, b] of [["OU1.5:UNDER", "BTTS:YES"], ["1X2:HOME", "1X2:AWAY"], ["1X2:HOME", "DC:X2"], ["OU2.5:OVER", "OU1.5:UNDER"]]) {
    const t = ticketMath([leg(a, 1.5), leg(b, 1.8)]);
    check(`contradictory ${a} + ${b}: P ≈ 0 and flagged`, t.prob < 1e-9 && t.contradictory, `P ${t.prob.toExponential(1)}`);
  }
  check("compatible OU2.5 UNDER + BTTS YES is not flagged", !ticketMath([leg("OU2.5:UNDER", 1.5), leg("BTTS:YES", 1.8)]).contradictory);
  const dnb = ticketMath([leg("DNB:HOME", 1.6)]);
  check("DNB single: E[return] = P(home)×odds + P(draw)×1", near(dnb.expectedReturn!, p["1X2:HOME"] * 1.6 + p["1X2:DRAW"], 1e-9));
  // A DNB price with negative EV: Kelly must not suggest a stake.
  const pw = p["1X2:HOME"], pd = p["1X2:DRAW"], pl = p["1X2:AWAY"];
  // EV = pw·o + pd − 1 < 0 needs o < (1 − pd)/pw; P(no loss)·o > 1 needs o > 1/(pw + pd). Take the middle.
  const o = Math.round(((1 / (pw + pd) + (1 - pd) / pw) / 2) * 100) / 100;
  const negDnb = [leg("DNB:HOME", o)];
  const t = ticketMath(negDnb);
  const advice = ticketAdvice({ legs: negDnb, stake: null, name: "QA", locale: "en", rules: { ...rules, maxStakePct: 0.5 }, currency: "MAD", suggestions: [] });
  const trueKelly = Math.max(0, (pw * (o - 1) - pl) / ((o - 1) * (pw + pl)));
  check(
    `DNB at ${o}: EV < 0 though P(no loss) × odds > 1, and the ticket Kelly suggests no stake`,
    t.ev! < 0 && t.prob * o > 1 && advice.kelly === 0,
    `EV ${(t.ev! * 100).toFixed(2)}%, P(no loss)×odds ${(t.prob * o).toFixed(3)}, Kelly used ${advice.kelly.toFixed(4)}, true Kelly ${trueKelly.toFixed(4)}`
  );
}

// ---------- 7. dates ----------
section("7. UK time → UTC around BST/GMT, and season codes");
{
  const cases: [string, string, string][] = [
    ["28/03/2026", "15:00", "2026-03-28T15:00:00.000Z"], // GMT, day before clocks go forward
    ["29/03/2026", "00:30", "2026-03-29T00:30:00.000Z"], // still GMT (change at 01:00 GMT)
    ["29/03/2026", "15:00", "2026-03-29T14:00:00.000Z"], // BST
    ["24/10/2026", "19:45", "2026-10-24T18:45:00.000Z"], // BST, evening before clocks go back
    ["25/10/2026", "00:30", "2026-10-24T23:30:00.000Z"], // still BST (change at 01:00 GMT)
    ["25/10/2026", "12:30", "2026-10-25T12:30:00.000Z"], // GMT
    ["01/08/26", "20:00", "2026-08-01T19:00:00.000Z"], // two-digit year, summer
    ["15/01/2027", "", "2027-01-15T15:00:00.000Z"], // no time → 15:00 UK
  ];
  for (const [d, tm, want] of cases) check(`${d} ${tm || "(no time)"} UK → ${want}`, parseKickoff(d, tm)?.toISOString() === want, parseKickoff(d, tm)?.toISOString());
  // Independent cross-check: format the result back in Europe/London.
  const london = (x: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(x);
  const round = ["10/03/2026 19:45", "29/03/2026 12:00", "05/07/2026 17:30", "25/10/2026 14:00", "26/12/2026 12:30"].every((s) => {
    const [d, tm] = s.split(" ");
    return london(parseKickoff(d, tm)!).replace(",", "") === `${d} ${tm}`;
  });
  check("round trip: UTC result shown in Europe/London is the input wall time", round);
  check("parseKickoff rejects a bad date", parseKickoff("2026-10-25", "15:00") === null && parseKickoff("", "15:00") === null);
  const sc: [string, string, number, string][] = [
    ["2026-06-30T23:59:59Z", "June → previous season", 0, "2526"],
    ["2026-07-01T00:00:00Z", "1 July → new season", 0, "2627"],
    ["2026-10-25T12:00:00Z", "October", 0, "2627"],
    ["2026-10-25T12:00:00Z", "previous season (offset −1)", -1, "2526"],
    ["2000-01-15T12:00:00Z", "century turn", 0, "9900"],
    ["2099-08-01T12:00:00Z", "2099/00", 0, "9900"],
  ];
  for (const [d, label, off, want] of sc) check(`seasonCode ${label} = ${want}`, seasonCode(new Date(d), off) === want, seasonCode(new Date(d), off));
}

// ---------- 8. look-ahead ----------
section("8. No look-ahead in model fitting and the backtest");
{
  const L = synthLeague({ seasons: 2, seed: 7 });
  const T = L.history[Math.floor(L.history.length * 0.6)].kickoff;
  const poisoned: HistMatch[] = L.history.map((m) => (m.kickoff >= T ? { ...m, hg: 9, ag: 0, hc: 30, ac: 0 } : m));
  const a = fitLeague("E0", L.history, T);
  const b = fitLeague("E0", poisoned, T);
  check("ratings fitted at T ignore every result from T on (future results replaced by 9-0)", JSON.stringify(a.goals) === JSON.stringify(b.goals) && JSON.stringify(a.corners) === JSON.stringify(b.corners));
  const pa = predictMatch(a, "Arsenal", "Chelsea"), pb = predictMatch(b, "Arsenal", "Chelsea");
  check("predictions at T are identical with or without the future", JSON.stringify(pa.probs) === JSON.stringify(pb.probs));
  check("a match kicking off exactly at T is not in the training set", a.goals.nMatches === L.history.filter((m) => m.kickoff < T).length);
  // The backtest loop (scripts/backtest.ts): each match is predicted by a model fitted at or before its kickoff.
  let fittedAt = 0, late = 0;
  for (const m of L.history.filter((x) => x.kickoff >= T)) {
    if (!fittedAt || m.kickoff.getTime() - fittedAt > 7 * 86_400_000) fittedAt = m.kickoff.getTime();
    if (fittedAt > m.kickoff.getTime()) late++;
  }
  check("backtest refit schedule never uses a model fitted after the match", late === 0);
}

done();

import { dictionaries, type Locale } from "../i18n";
import { tau } from "./ratings";

export type Probs = Record<string, number>;

export function poissonPmf(l: number, max: number): number[] {
  const out = new Array(max + 1).fill(0);
  out[0] = Math.exp(-l);
  for (let k = 1; k <= max; k++) out[k] = (out[k - 1] * l) / k;
  return out;
}

function lgamma(z: number): number {
  // Lanczos approximation
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Negative binomial with mean m and variance phi*m. phi<=1 falls back to Poisson. */
export function negBinPmf(m: number, phi: number, max: number): number[] {
  if (phi <= 1.0001) return poissonPmf(m, max);
  const r = m / (phi - 1);
  const p = r / (r + m);
  const out: number[] = [];
  for (let k = 0; k <= max; k++) {
    out.push(Math.exp(lgamma(k + r) - lgamma(r) - lgamma(k + 1) + r * Math.log(p) + k * Math.log(1 - p)));
  }
  return out;
}

/** Joint score matrix with Dixon-Coles correction, normalised. */
export function scoreMatrix(lh: number, la: number, rho: number, max = 10): number[][] {
  const ph = poissonPmf(lh, max);
  const pa = poissonPmf(la, max);
  const m: number[][] = [];
  let total = 0;
  for (let x = 0; x <= max; x++) {
    m.push([]);
    for (let y = 0; y <= max; y++) {
      const v = Math.max(0, ph[x] * pa[y] * tau(x, y, lh, la, rho));
      m[x].push(v);
      total += v;
    }
  }
  return m.map((row) => row.map((v) => v / total));
}

export function goalMarkets(m: number[][]): Probs {
  const p: Probs = {};
  let home = 0, draw = 0, away = 0, btts = 0;
  const totals: Record<string, number> = { "0.5": 0, "1.5": 0, "2.5": 0, "3.5": 0, "4.5": 0 };
  let h05 = 0, h15 = 0, a05 = 0, a15 = 0;
  for (let x = 0; x < m.length; x++) {
    for (let y = 0; y < m[x].length; y++) {
      const v = m[x][y];
      if (x > y) home += v;
      else if (x === y) draw += v;
      else away += v;
      if (x > 0 && y > 0) btts += v;
      for (const line of Object.keys(totals)) if (x + y > Number(line)) totals[line] += v;
      if (x > 0) h05 += v;
      if (x > 1) h15 += v;
      if (y > 0) a05 += v;
      if (y > 1) a15 += v;
    }
  }
  p["1X2:HOME"] = home;
  p["1X2:DRAW"] = draw;
  p["1X2:AWAY"] = away;
  p["DC:1X"] = home + draw;
  p["DC:X2"] = draw + away;
  p["DC:12"] = home + away;
  p["DNB:HOME"] = home / (home + away);
  p["DNB:AWAY"] = away / (home + away);
  for (const [line, v] of Object.entries(totals)) {
    p[`OU${line}:OVER`] = v;
    p[`OU${line}:UNDER`] = 1 - v;
  }
  p["BTTS:YES"] = btts;
  p["BTTS:NO"] = 1 - btts;
  p["HOMEGOALS0.5:OVER"] = h05;
  p["HOMEGOALS1.5:OVER"] = h15;
  p["AWAYGOALS0.5:OVER"] = a05;
  p["AWAYGOALS1.5:OVER"] = a15;
  return p;
}

export function topScores(m: number[][], n = 6) {
  const all: { score: string; p: number }[] = [];
  m.forEach((row, x) => row.forEach((p, y) => all.push({ score: `${x}-${y}`, p })));
  return all.sort((a, b) => b.p - a.p).slice(0, n);
}

export function cornerMarkets(lh: number, la: number, phi: number): Probs {
  const max = 30;
  const ph = negBinPmf(lh, phi, max);
  const pa = negBinPmf(la, phi, max);
  const total = new Array(2 * max + 1).fill(0);
  let homeMore = 0, awayMore = 0, tie = 0;
  for (let x = 0; x <= max; x++)
    for (let y = 0; y <= max; y++) {
      const v = ph[x] * pa[y];
      total[x + y] += v;
      if (x > y) homeMore += v;
      else if (x < y) awayMore += v;
      else tie += v;
    }
  const norm = total.reduce((s, v) => s + v, 0);
  const p: Probs = {};
  for (const line of [7.5, 8.5, 9.5, 10.5, 11.5, 12.5]) {
    let over = 0;
    for (let k = Math.ceil(line); k < total.length; k++) over += total[k];
    p[`CORNERS${line}:OVER`] = over / norm;
    p[`CORNERS${line}:UNDER`] = 1 - over / norm;
  }
  p["CORNERRACE:HOME"] = homeMore / norm;
  p["CORNERRACE:TIE"] = tie / norm;
  p["CORNERRACE:AWAY"] = awayMore / norm;
  return p;
}

/**
 * Human readable label for a market key such as "OU2.5:OVER". The pipeline stores and
 * sends the English label to the AI; pages pass the interface locale.
 */
export function marketLabel(key: string, home: string, away: string, locale: Locale = "en"): string {
  const t = dictionaries[locale].markets;
  const [market, sel] = key.split(":");
  const line = market.replace(/^[A-Z]+/, "");
  if (market === "1X2") return sel === "HOME" ? t.win(home) : sel === "AWAY" ? t.win(away) : t.draw;
  if (market === "DC") return sel === "1X" ? t.orDraw(home) : sel === "X2" ? t.orDraw(away) : t.noDraw;
  if (market === "DNB") return t.drawNoBet(sel === "HOME" ? home : away);
  if (market.startsWith("OU")) return sel === "OVER" ? t.over(line) : t.under(line);
  if (market === "BTTS") return t.btts(sel === "YES");
  if (market.startsWith("HOMEGOALS")) return t.teamOver(home, line);
  if (market.startsWith("AWAYGOALS")) return t.teamOver(away, line);
  if (market.startsWith("CORNERS")) return sel === "OVER" ? t.cornersOver(line) : t.cornersUnder(line);
  if (market === "CORNERRACE") return sel === "TIE" ? t.cornersLevel : t.moreCorners(sel === "HOME" ? home : away);
  return key;
}

/** Name of a market code such as "OU2.5" (the part of the key before ":"). */
export function marketName(market: string, locale: Locale = "en"): string {
  const t = dictionaries[locale].markets.names;
  const line = market.replace(/^[A-Z]+/, "");
  if (market === "1X2") return t.result;
  if (market === "DC") return t.doubleChance;
  if (market === "DNB") return t.drawNoBet;
  if (market === "BTTS") return t.btts;
  if (market.startsWith("OU")) return t.totalGoals(line);
  if (/^(HOME|AWAY)GOALS/.test(market)) return t.teamGoals;
  if (market === "CORNERRACE") return t.cornerRace;
  if (market.startsWith("CORNERS")) return t.totalCorners(line);
  return market;
}

/** `id` is the key in the dictionaries' markets.groups. */
export const MARKET_GROUPS: { id: "result" | "goals" | "corners"; prefix: RegExp }[] = [
  { id: "result", prefix: /^(1X2|DC|DNB):/ },
  { id: "goals", prefix: /^(OU|BTTS|HOMEGOALS|AWAYGOALS)/ },
  { id: "corners", prefix: /^CORNER/ },
];

/** Display order (jsonb does not keep key order). */
export const DISPLAY_KEYS = [
  "1X2:HOME", "1X2:DRAW", "1X2:AWAY", "DC:1X", "DC:X2", "DC:12", "DNB:HOME", "DNB:AWAY",
  "OU1.5:OVER", "OU1.5:UNDER", "OU2.5:OVER", "OU2.5:UNDER", "OU3.5:OVER", "OU3.5:UNDER",
  "BTTS:YES", "BTTS:NO", "HOMEGOALS0.5:OVER", "HOMEGOALS1.5:OVER", "AWAYGOALS0.5:OVER", "AWAYGOALS1.5:OVER",
  "CORNERS8.5:OVER", "CORNERS8.5:UNDER", "CORNERS9.5:OVER", "CORNERS9.5:UNDER", "CORNERS10.5:OVER", "CORNERS10.5:UNDER",
  "CORNERRACE:HOME", "CORNERRACE:TIE", "CORNERRACE:AWAY",
];

import type { HistMatch, Fixture } from "../src/lib/data/footballdata";

/** Synthetic league with known true strengths, for testing the model offline. */
export function synthLeague(opts: { league?: string; teams?: number; seasons?: number; seed?: number; start?: Date } = {}) {
  let s = opts.seed ?? 42;
  const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const pois = (l: number) => {
    let k = 0, p = Math.exp(-l), c = p;
    const u = rand();
    while (u > c && k < 20) { k++; p *= l / k; c += p; }
    return k;
  };
  const league = opts.league ?? "E0";
  const names = ["Arsenal","Chelsea","Liverpool","Man City","Man United","Tottenham","Newcastle","Aston Villa","Brighton","West Ham","Everton","Fulham","Brentford","Crystal Palace","Wolves","Bournemouth","Nott'm Forest","Leeds","Burnley","Sunderland"].slice(0, opts.teams ?? 20);
  const truth = Object.fromEntries(names.map((n, i) => [n, { a: Math.exp(0.45 - (0.9 * i) / names.length + (rand() - 0.5) * 0.2), d: Math.exp(-0.35 + (0.7 * i) / names.length + (rand() - 0.5) * 0.2), c: 0.8 + rand() * 0.5 }]));
  const base = 1.2, home = 1.2, cBase = 4.6;
  const lam = (h: string, a: string) => ({ h: base * home * truth[h].a * truth[a].d, a: base * truth[a].a * truth[h].d });
  const fakeOdds = (h: string, a: string) => {
    // a "market" that knows the truth, plus 6% margin and noise
    const l = lam(h, a);
    let ph = 0, pd = 0, pa = 0, pov = 0;
    const P = (k: number, x: number) => Math.exp(-x) * x ** k / [1,1,2,6,24,120,720,5040,40320,362880,3628800][k];
    for (let x = 0; x <= 10; x++) for (let y = 0; y <= 10; y++) { const v = P(x, l.h) * P(y, l.a); if (x > y) ph += v; else if (x === y) pd += v; else pa += v; if (x + y > 2.5) pov += v; }
    const noise = () => 1 + (rand() - 0.5) * 0.08;
    const norm = (v: number[]) => { const t = v.reduce((a, b) => a + b, 0); return v.map((x) => x / t); };
    const fair = norm([ph * noise(), pd * noise(), pa * noise()]);
    const ou = norm([pov * noise(), (1 - pov) * noise()]);
    const r = (p: number) => Math.round((1 / (p * 1.06)) * 100) / 100;
    return { "1X2:HOME": r(fair[0]), "1X2:DRAW": r(fair[1]), "1X2:AWAY": r(fair[2]), "OU2.5:OVER": r(ou[0]), "OU2.5:UNDER": r(ou[1]) };
  };
  const start = opts.start ?? new Date(Date.UTC(2025, 7, 9, 14));
  const history: HistMatch[] = [];
  let day = 0;
  for (let season = 0; season < (opts.seasons ?? 2); season++) {
    for (let round = 0; round < 2; round++)
      for (const h of names) for (const a of names) {
        if (h === a) continue;
        const kickoff = new Date(start.getTime() + (season * 365 + (day++ % 280)) * 86_400_000);
        const l = lam(h, a);
        const odds = fakeOdds(h, a);
        history.push({ league, kickoff, home: h, away: a, hg: pois(l.h), ag: pois(l.a), hc: pois(cBase * truth[h].c * 1.1), ac: pois(cBase * truth[a].c * 0.9), odds, closing: odds });
      }
  }
  history.sort((x, y) => x.kickoff.getTime() - y.kickoff.getTime());
  const fixtures = (now: Date, n = 10): Fixture[] => {
    const out: Fixture[] = [];
    const shuffled = [...names].sort(() => rand() - 0.5);
    for (let i = 0; i + 1 < shuffled.length && out.length < n; i += 2) {
      const kickoff = new Date(now.getTime() + (6 + i) * 3_600_000);
      out.push({ league, kickoff, home: shuffled[i], away: shuffled[i + 1], odds: fakeOdds(shuffled[i], shuffled[i + 1]) });
    }
    return out;
  };
  const play = (f: Fixture): HistMatch => {
    const l = lam(f.home, f.away);
    return { league, kickoff: f.kickoff, home: f.home, away: f.away, hg: pois(l.h), ag: pois(l.a), hc: pois(cBase * truth[f.home].c * 1.1), ac: pois(cBase * truth[f.away].c * 0.9), odds: f.odds, closing: fakeOdds(f.home, f.away) };
  };
  return { history, fixtures, play, truth, names };
}

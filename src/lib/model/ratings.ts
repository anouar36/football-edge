/**
 * Time-weighted Poisson team ratings (Maher / Dixon-Coles style).
 *
 *   home goals ~ Poisson(base * homeAdv * attack[home] * defence[away])
 *   away goals ~ Poisson(base *           attack[away] * defence[home])
 *
 * attack > 1 = scores more than average, defence > 1 = concedes more than average.
 * Fitted by iterative proportional fitting with a shrinkage prior so teams
 * with few matches stay close to average.
 */
export interface Obs {
  kickoff: Date;
  home: string;
  away: string;
  hs: number; // home "score" (goals or corners)
  as: number; // away "score"
}

export interface Ratings {
  base: number;
  homeAdv: number;
  attack: Record<string, number>;
  defence: Record<string, number>;
  games: Record<string, number>;
  rho: number; // Dixon-Coles low-score correction (goals only)
  dispersion: number; // variance / mean (1 = Poisson). Used for corners.
  nMatches: number;
}

export interface FitOptions {
  refDate: Date;
  xi?: number; // time decay per day
  prior?: number; // pseudo-games pulling ratings to the prior target
  iterations?: number;
  /** prior targets for specific teams (e.g. promoted sides) */
  priorTargets?: Record<string, { attack: number; defence: number }>;
  estimateRho?: boolean;
}

const DAY = 86_400_000;

export function fitRatings(data: Obs[], opts: FitOptions): Ratings {
  const xi = opts.xi ?? 0.0019;
  const prior = opts.prior ?? 4;
  const iterations = opts.iterations ?? 60;
  const ref = opts.refDate.getTime();

  const obs = data
    .filter((o) => o.kickoff.getTime() < ref && Number.isFinite(o.hs) && Number.isFinite(o.as))
    .map((o) => ({ ...o, w: Math.exp((-xi * (ref - o.kickoff.getTime())) / DAY) }));

  const teams = Array.from(new Set(obs.flatMap((o) => [o.home, o.away])));
  const attack: Record<string, number> = {};
  const defence: Record<string, number> = {};
  const games: Record<string, number> = {};
  for (const t of teams) {
    attack[t] = 1;
    defence[t] = 1;
    games[t] = 0;
  }
  for (const o of obs) {
    games[o.home]++;
    games[o.away]++;
  }

  const sw = obs.reduce((s, o) => s + o.w, 0) || 1;
  const meanHome = obs.reduce((s, o) => s + o.w * o.hs, 0) / sw || 1.5;
  const meanAway = obs.reduce((s, o) => s + o.w * o.as, 0) / sw || 1.2;
  let base = meanAway;
  let homeAdv = meanHome / meanAway;
  const m = (meanHome + meanAway) / 2; // average expected per team-game

  const target = (t: string) => opts.priorTargets?.[t] ?? { attack: 1, defence: 1 };

  for (let it = 0; it < iterations; it++) {
    // attack
    for (const t of teams) {
      let num = 0;
      let den = 0;
      for (const o of obs) {
        if (o.home === t) {
          num += o.w * o.hs;
          den += o.w * base * homeAdv * defence[o.away];
        } else if (o.away === t) {
          num += o.w * o.as;
          den += o.w * base * defence[o.home];
        }
      }
      attack[t] = (num + prior * m * target(t).attack) / (den + prior * m);
    }
    // defence
    for (const t of teams) {
      let num = 0;
      let den = 0;
      for (const o of obs) {
        if (o.home === t) {
          num += o.w * o.as;
          den += o.w * base * attack[o.away];
        } else if (o.away === t) {
          num += o.w * o.hs;
          den += o.w * base * homeAdv * attack[o.home];
        }
      }
      defence[t] = (num + prior * m * target(t).defence) / (den + prior * m);
    }
    // normalise to mean 1
    const ma = teams.reduce((s, t) => s + attack[t], 0) / (teams.length || 1);
    const md = teams.reduce((s, t) => s + defence[t], 0) / (teams.length || 1);
    for (const t of teams) {
      attack[t] /= ma;
      defence[t] /= md;
    }
    // home advantage + base
    let hn = 0, hd = 0, bn = 0, bd = 0;
    for (const o of obs) {
      hn += o.w * o.hs;
      hd += o.w * base * attack[o.home] * defence[o.away];
      bn += o.w * (o.hs + o.as);
      bd += o.w * (homeAdv * attack[o.home] * defence[o.away] + attack[o.away] * defence[o.home]);
    }
    homeAdv = hd > 0 ? hn / hd : homeAdv;
    base = bd > 0 ? bn / bd : base;
  }

  // over-dispersion (variance / mean) of residuals
  let rn = 0, rd = 0;
  for (const o of obs) {
    const lh = base * homeAdv * attack[o.home] * defence[o.away];
    const la = base * attack[o.away] * defence[o.home];
    rn += o.w * ((o.hs - lh) ** 2 + (o.as - la) ** 2);
    rd += o.w * (lh + la);
  }
  const dispersion = Math.min(3, Math.max(1, rd > 0 ? rn / rd : 1));

  const r: Ratings = { base, homeAdv, attack, defence, games, rho: 0, dispersion, nMatches: obs.length };
  if (opts.estimateRho) r.rho = estimateRho(obs, r);
  return r;
}

export function expected(r: Ratings, home: string, away: string, unknown = { attack: 0.85, defence: 1.15 }) {
  const aH = r.attack[home] ?? unknown.attack;
  const dH = r.defence[home] ?? unknown.defence;
  const aA = r.attack[away] ?? unknown.attack;
  const dA = r.defence[away] ?? unknown.defence;
  return {
    home: r.base * r.homeAdv * aH * dA,
    away: r.base * aA * dH,
    known: home in r.attack && away in r.attack,
  };
}

export function tau(x: number, y: number, lh: number, la: number, rho: number) {
  if (x === 0 && y === 0) return 1 - lh * la * rho;
  if (x === 0 && y === 1) return 1 + lh * rho;
  if (x === 1 && y === 0) return 1 + la * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

function poissonLogPmf(k: number, l: number) {
  let lf = 0;
  for (let i = 2; i <= k; i++) lf += Math.log(i);
  return k * Math.log(l) - l - lf;
}

function estimateRho(obs: (Obs & { w: number })[], r: Ratings): number {
  let best = 0;
  let bestLL = -Infinity;
  for (let rho = -0.2; rho <= 0.1001; rho += 0.01) {
    let ll = 0;
    for (const o of obs) {
      const lh = r.base * r.homeAdv * r.attack[o.home] * r.defence[o.away];
      const la = r.base * r.attack[o.away] * r.defence[o.home];
      const t = tau(o.hs, o.as, lh, la, rho);
      if (t <= 0) {
        ll = -Infinity;
        break;
      }
      ll += o.w * (Math.log(t) + poissonLogPmf(o.hs, lh) + poissonLogPmf(o.as, la));
    }
    if (ll > bestLL) {
      bestLL = ll;
      best = rho;
    }
  }
  return Math.round(best * 100) / 100;
}

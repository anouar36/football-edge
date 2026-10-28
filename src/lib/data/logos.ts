import { and, inArray, isNotNull } from "drizzle-orm";
import { getReadyDb } from "../db";
import { leagueLogos, teamLogos } from "../schema";
import { searchNames } from "./team-aliases";

/**
 * Team and league logos, cached in the team_logos / league_logos tables.
 *
 * TheSportsDB (default, free key "123", https://www.thesportsdb.com/documentation):
 *   searchteams.php?t={name}   -> teams[].strBadge   (the free key returns one team per search)
 *   lookupleague.php?id={id}   -> leagues[].strBadge
 *   Documented free limit is 30 requests a minute; past the real limit Cloudflare answers 429 for a minute or two.
 *
 * API-Football (when API_FOOTBALL_KEY is set, https://www.api-football.com/documentation-v3):
 *   GET v3.football.api-sports.io/teams?search={name}  -> response[].team.logo
 *   GET v3.football.api-sports.io/leagues?id={id}      -> response[].league.logo
 *   Free plan: 100 requests a day, so a full sync can take two days.
 */

/** Our league codes -> each source's league id, and the countries its clubs are registered in. */
export const LOGO_LEAGUES: Record<string, { tsdb: string; apiFootball: number; countries: string[] }> = {
  E0: { tsdb: "4328", apiFootball: 39, countries: ["England", "Wales"] },
  E1: { tsdb: "4329", apiFootball: 40, countries: ["England", "Wales"] },
  SP1: { tsdb: "4335", apiFootball: 140, countries: ["Spain"] },
  I1: { tsdb: "4332", apiFootball: 135, countries: ["Italy"] },
  D1: { tsdb: "4331", apiFootball: 78, countries: ["Germany"] },
  F1: { tsdb: "4334", apiFootball: 61, countries: ["France", "Monaco"] },
  N1: { tsdb: "4337", apiFootball: 88, countries: ["Netherlands", "The Netherlands"] },
  P1: { tsdb: "4344", apiFootball: 94, countries: ["Portugal"] },
  B1: { tsdb: "4338", apiFootball: 144, countries: ["Belgium"] },
  T1: { tsdb: "4339", apiFootball: 203, countries: ["Turkey", "Türkiye"] },
  SC0: { tsdb: "4330", apiFootball: 179, countries: ["Scotland"] },
  G1: { tsdb: "4336", apiFootball: 197, countries: ["Greece"] },
};

const RETRY_MISSING_AFTER = 30 * 86_400_000;

/** Stops the whole sync: rate limit we cannot wait out, daily quota used up, bad key. */
class StopSync extends Error {}

interface Candidate {
  names: string[];
  /** true/false when the source says which leagues the club plays in, null when it does not. */
  inLeague: boolean | null;
  country: string;
  logo: string | null | undefined;
}

interface Source {
  id: "thesportsdb" | "api-football";
  team(name: string, league: string): Promise<{ url: string; matched: string } | null>;
  league(code: string): Promise<string | null>;
}

// ---------- name matching ----------

/** Legal-form words and years that clubs add or drop ("FC Porto" = "Porto", "Mainz 05" = "Mainz"). */
const GENERIC = new Set("fc cf afc sc ac as ss ssc us cd ud sd rc rcd sv vfb vfl tsg fk sk kv krc kaa rsc club de".split(" "));

const tokens = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !GENERIC.has(w) && !/^\d+$/.test(w));

const sameSet = (a: string[], b: string[]) => a.length > 0 && a.length === b.length && a.every((w) => b.includes(w));
const within = (a: string[], b: string[]) => a.length > 0 && a.every((w) => b.includes(w));

/**
 * Picks the club a search meant. Same words as the query always counts; a shorter or
 * longer name ("Alaves" for "Deportivo Alaves") only when the club is known to play in
 * the league, so "Dundee" never takes the Dundee United badge from a country match alone.
 */
function choose(cands: Candidate[], query: string, countries: string[]): Candidate | null {
  const q = tokens(query);
  let best: { c: Candidate; score: number } | null = null;
  for (const c of cands) {
    if (!c.logo || !(c.inLeague === true || countries.includes(c.country))) continue;
    const names = c.names.map(tokens);
    const score = names.some((n) => sameSet(q, n)) ? 2 : c.inLeague !== false && names.some((n) => within(q, n) || within(n, q)) ? 1 : 0;
    if (score && (!best || score > best.score)) best = { c, score };
  }
  return best?.c ?? null;
}

// ---------- HTTP with a shared pace ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Spaces request starts at least `gapMs` apart across all workers; `pause` delays everyone. */
function pacer(gapMs: number) {
  let next = 0;
  return {
    async wait() {
      const now = Date.now();
      const at = Math.max(now, next);
      next = at + gapMs;
      if (at > now) await sleep(at - now);
    },
    pause(ms: number) {
      next = Math.max(next, Date.now() + ms);
    },
  };
}

interface Ctx {
  pace: ReturnType<typeof pacer>;
  deadline: number;
  note?: (line: string) => void;
}

async function getJson(url: string, { pace, deadline, note }: Ctx, headers?: Record<string, string>) {
  for (let attempt = 0; ; attempt++) {
    await pace.wait();
    const res = await fetch(url, { headers: { "User-Agent": "football-edge/1.0", ...headers }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (res.status === 429) {
      // Retrying sooner keeps the block alive, so wait out a full minute.
      if (attempt >= 2 || Date.now() + 70_000 > deadline) throw new StopSync("rate limited (HTTP 429)");
      pace.pause(65_000);
      note?.(`rate limited by ${new URL(url).host}, waiting 65s`);
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new StopSync(`HTTP ${res.status} from ${new URL(url).host}`);
    if (!res.ok) throw new Error(`${new URL(url).pathname} -> HTTP ${res.status}`);
    return { body: await res.json(), headers: res.headers };
  }
}

// ---------- sources ----------

function theSportsDb(deadline: number, note?: Ctx["note"]): Source {
  const base = `https://www.thesportsdb.com/api/v1/json/${process.env.THESPORTSDB_API_KEY || "123"}`;
  // The documented free limit is 30/minute, but in practice ~12 requests in 35s already trigger a 2-minute block.
  const ctx: Ctx = { pace: pacer(6_000), deadline, note };
  type Team = Record<string, string | null>;
  return {
    id: "thesportsdb",
    async team(name, league) {
      const { tsdb, countries } = LOGO_LEAGUES[league];
      for (const q of searchNames(name)) {
        const { body } = await getJson(`${base}/searchteams.php?t=${encodeURIComponent(q)}`, ctx);
        const teams: Team[] = (body?.teams ?? []).filter((t: Team) => t.strSport === "Soccer" && t.strGender !== "Female");
        const hit = choose(
          teams.map((t) => ({
            names: [t.strTeam, t.strTeamShort, ...(t.strTeamAlternate ?? "").split(",")].filter((x): x is string => !!x?.trim()),
            inLeague: ["", "2", "3", "4", "5", "6", "7"].some((i) => t[`idLeague${i}`] === tsdb),
            country: t.strCountry ?? "",
            logo: t.strBadge,
          })),
          q,
          countries
        );
        if (hit) return { url: hit.logo!, matched: hit.names[0] };
      }
      return null;
    },
    async league(code) {
      const { body } = await getJson(`${base}/lookupleague.php?id=${LOGO_LEAGUES[code].tsdb}`, ctx);
      return body?.leagues?.[0]?.strBadge || null;
    },
  };
}

function apiFootball(key: string, deadline: number, note?: Ctx["note"]): Source {
  const base = "https://v3.football.api-sports.io";
  const ctx: Ctx = { pace: pacer(6_500), deadline, note }; // free plan allows 10 requests a minute
  let remaining = Infinity;
  const call = async (path: string) => {
    if (remaining <= 1) throw new StopSync("API-Football daily quota used up");
    const { body, headers } = await getJson(`${base}${path}`, ctx, { "x-apisports-key": key });
    const left = Number(headers.get("x-ratelimit-requests-remaining"));
    if (Number.isFinite(left)) remaining = left;
    const errors = body?.errors;
    // Errors come back with HTTP 200, e.g. { requests: "You have reached the request limit for the day" }.
    if (errors && Object.keys(errors).length) throw new StopSync(`API-Football: ${JSON.stringify(errors)}`);
    return body?.response ?? [];
  };
  return {
    id: "api-football",
    async team(name, league) {
      const { countries } = LOGO_LEAGUES[league];
      for (const name0 of searchNames(name)) {
        // search accepts letters, digits and spaces, 3 characters or more
        const q = name0.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ]/g, "").trim();
        if (q.length < 3) continue;
        const rows: { team: { name: string; code: string | null; country: string; national: boolean; logo: string } }[] = await call(
          `/teams?search=${encodeURIComponent(q)}`
        );
        const hit = choose(
          rows.filter((r) => !r.team.national).map((r) => ({ names: [r.team.name], inLeague: null, country: r.team.country, logo: r.team.logo })),
          name0,
          countries
        );
        if (hit) return { url: hit.logo!, matched: hit.names[0] };
      }
      return null;
    },
    async league(code) {
      const rows = await call(`/leagues?id=${LOGO_LEAGUES[code].apiFootball}`);
      return rows[0]?.league?.logo || null;
    },
  };
}

// ---------- cache fill ----------

export interface LogoSyncResult {
  source: Source["id"];
  /** teams sent to the source this run */
  searched: number;
  found: { name: string; league: string; matched: string }[];
  missing: { name: string; league: string }[];
  /** teams that got a logo already cached for the same club in another league of the same country */
  reused: number;
  leagues: { found: string[]; missing: string[] };
  /** why the run stopped early (time budget, rate limit, quota); the rest is picked up next time */
  stopped?: string;
  errors: string[];
}

/**
 * Looks up logos for the teams and leagues that are not cached yet. Never throws: a logo
 * problem must not fail the caller (the daily job).
 * A team searched without result is stored with a null logo and searched again after 30
 * days, or right away with `retryMissing` (after adding an alias).
 */
export async function syncLogos(
  input: { teams: { name: string; league: string }[]; leagues: string[] },
  opts: { budgetMs?: number; retryMissing?: boolean; concurrency?: number; progress?: (line: string) => void } = {}
): Promise<LogoSyncResult> {
  const deadline = Date.now() + (opts.budgetMs ?? Infinity);
  const key = process.env.API_FOOTBALL_KEY;
  const source = key ? apiFootball(key, deadline, opts.progress) : theSportsDb(deadline, opts.progress);
  const out: LogoSyncResult = { source: source.id, searched: 0, found: [], missing: [], reused: 0, leagues: { found: [], missing: [] }, errors: [] };

  try {
    const db = await getReadyDb();
    const seen = new Set<string>();
    const teams = input.teams.filter((t) => {
      const k = `${t.name}|${t.league}`;
      if (!LOGO_LEAGUES[t.league] || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const codes = Array.from(new Set(input.leagues)).filter((c) => LOGO_LEAGUES[c]);

    const names = Array.from(new Set(teams.map((t) => t.name)));
    const cached = names.length ? await db.select().from(teamLogos).where(inArray(teamLogos.name, names)) : [];
    const byKey = new Map(cached.map((r) => [`${r.name}|${r.league}`, r]));
    const stale = Date.now() - RETRY_MISSING_AFTER;
    const todo = teams.filter((t) => {
      const r = byKey.get(`${t.name}|${t.league}`);
      if (!r) return true;
      if (r.logoUrl) return false;
      return opts.retryMissing || r.checkedAt.getTime() < stale || r.source !== source.id;
    });

    const save = (name: string, league: string, logoUrl: string | null, from = source.id) =>
      db
        .insert(teamLogos)
        .values({ name, league, logoUrl, source: from, checkedAt: new Date() })
        .onConflictDoUpdate({ target: [teamLogos.name, teamLogos.league], set: { logoUrl, source: from, checkedAt: new Date() } });

    // A promoted or relegated club keeps its badge: reuse it from the other league of the same country.
    const sameCountry = (a: string, b: string) => LOGO_LEAGUES[a].countries[0] === LOGO_LEAGUES[b].countries[0];
    const queue: (() => Promise<void>)[] = [];
    for (const t of todo) {
      const other = cached.find((r) => r.name === t.name && r.logoUrl && r.league !== t.league && sameCountry(r.league, t.league));
      if (other) {
        await save(t.name, t.league, other.logoUrl, other.source as Source["id"]);
        out.reused++;
        continue;
      }
      queue.push(async () => {
        out.searched++;
        const hit = await source.team(t.name, t.league);
        await save(t.name, t.league, hit?.url ?? null);
        if (hit) out.found.push({ name: t.name, league: t.league, matched: hit.matched });
        else out.missing.push({ name: t.name, league: t.league });
        opts.progress?.(`${t.league} ${t.name} -> ${hit ? hit.matched : "no logo"}`);
      });
    }

    const haveLeagues = codes.length ? await db.select({ code: leagueLogos.code }).from(leagueLogos).where(and(inArray(leagueLogos.code, codes), isNotNull(leagueLogos.logoUrl))) : [];
    for (const code of codes.filter((c) => !haveLeagues.some((r) => r.code === c))) {
      // League lookups go first: one call each and shown on every row.
      queue.unshift(async () => {
        const url = await source.league(code);
        if (!url) {
          out.leagues.missing.push(code);
          return;
        }
        await db.insert(leagueLogos).values({ code, logoUrl: url }).onConflictDoUpdate({ target: leagueLogos.code, set: { logoUrl: url } });
        out.leagues.found.push(code);
      });
    }

    let failures = 0;
    const worker = async () => {
      while (queue.length && !out.stopped) {
        if (Date.now() > deadline) {
          out.stopped = "time budget used";
          break;
        }
        const job = queue.shift()!;
        try {
          await job();
          failures = 0;
        } catch (e) {
          if (e instanceof StopSync) out.stopped = e.message;
          else {
            out.errors.push((e as Error).message);
            // Offline or the source is down: no point trying every team.
            if (++failures >= 4) out.stopped = `${failures} failed requests in a row`;
          }
        }
      }
    };
    await Promise.all(Array.from({ length: opts.concurrency ?? 2 }, worker));
    if (out.stopped && queue.length) out.stopped += ` (${queue.length} lookups left for next time)`;
  } catch (e) {
    out.stopped = (e as Error).message;
  }
  return out;
}

/** One line for the daily run log, or null when everything was already cached. */
export function logoSummary(r: LogoSyncResult) {
  if (!r.searched && !r.reused && !r.stopped && !r.leagues.found.length && !r.leagues.missing.length) return null;
  const parts = [`${r.searched} teams searched on ${r.source}`, `${r.found.length} found`];
  if (r.reused) parts.push(`${r.reused} reused`);
  if (r.missing.length) parts.push(`no logo: ${r.missing.map((m) => `${m.name} (${m.league})`).join(", ")}`);
  if (r.leagues.found.length || r.leagues.missing.length) parts.push(`leagues ${r.leagues.found.length} found, ${r.leagues.missing.length} missing`);
  if (r.stopped) parts.push(`stopped: ${r.stopped}`);
  return `logos: ${parts.join(" · ")}`;
}

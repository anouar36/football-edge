import { and, asc, count, desc, eq, gte, inArray, ne, sql, type SQL } from "drizzle-orm";
import { getDb, getSettings } from "./db";
import { TAG, cached } from "./cache";
import { leagueLogos, matches, picks, runs, teamLogos, ticketLegs, tickets, type Match, type Pick } from "./schema";
import type { PerfStats } from "./queries";

/*
 * Cached, light reads for the pages (see cache.ts). Lists never load the `prediction` / `analysis`
 * jsonb: the few values they show are extracted by Postgres (->>), so only those cross the network.
 * Writes and the pipelines keep using getSettings() / getDb() directly.
 */

/** Rows per page for /matches?past=1, /history and the tickets list. */
export const PAGE_SIZE = 50;

/** Settings for rendering. Writes and the pipelines read getSettings(), which is never cached. */
export const cachedSettings = cached("settings", [TAG.settings], () => getSettings());

/* ---------- matches without their jsonb ---------- */

const P = matches.prediction;
const float = (expr: SQL) => sql<number | null>`(${expr})::float8`;

/** Model probabilities shown in the Matches list (one add-to-ticket toggle each). */
export const LIST_KEYS = ["1X2:HOME", "1X2:DRAW", "1X2:AWAY", "OU2.5:OVER", "BTTS:YES"];

const liteColumns = {
  id: matches.id,
  league: matches.league,
  kickoff: matches.kickoff,
  home: matches.home,
  away: matches.away,
  status: matches.status,
  homeGoals: matches.homeGoals,
  awayGoals: matches.awayGoals,
  odds: matches.odds,
  xgHome: float(sql`${P}->>'xgHome'`),
  xgAway: float(sql`${P}->>'xgAway'`),
  rho: float(sql`${P}#>>'{model,rho}'`),
  xcHome: float(sql`${P}->>'xcHome'`),
  xcAway: float(sql`${P}->>'xcAway'`),
  cornerDispersion: float(sql`${P}#>>'{model,cornerDispersion}'`),
  // The AI review's one-line headline, for CAUTION / AVOID tips in the ticket panel.
  headline: sql<string | null>`${matches.analysis}->>'headline'`,
};

/** A match as the lists need it: no prediction or analysis blob. */
export type MatchLite = {
  id: string;
  league: string;
  kickoff: Date;
  home: string;
  away: string;
  status: string;
  homeGoals: number | null;
  awayGoals: number | null;
  odds: Record<string, number> | null;
  xgHome: number | null;
  xgAway: number | null;
  rho: number | null;
  xcHome: number | null;
  xcAway: number | null;
  cornerDispersion: number | null;
  headline: string | null;
};

export type PickLite = Pick & { match: MatchLite };

/** Open picks of matches that kicked off at most 3 hours ago, with their match. Same rows as upcomingPicks(). */
const loadUpcoming = cached("upcoming-picks", [TAG.picks, TAG.matches], async (): Promise<PickLite[]> => {
  const db = getDb();
  const rows = await db
    .select({ pick: picks, match: liteColumns })
    .from(picks)
    .innerJoin(matches, eq(picks.matchId, matches.id))
    .where(and(eq(picks.result, "PENDING"), gte(matches.kickoff, new Date(Date.now() - 3 * 3_600_000))))
    .orderBy(asc(matches.kickoff), desc(picks.edge));
  return rows.map((r) => ({ ...r.pick, match: r.match }));
});

/** Filtered again on read: a cached list must not keep a match that kicked off more than 3 hours ago. */
export async function upcomingPicksLite(now = Date.now()) {
  return (await loadUpcoming()).filter((p) => p.match.kickoff.getTime() >= now - 3 * 3_600_000);
}

export type MatchRow = MatchLite & {
  probs: Record<string, number | null>;
  /** The match's best pick (highest edge), if any. */
  pick: { key: string; prob: number; modelProb: number; odds: number; verdict: string | null } | null;
};

const listColumns = {
  ...liteColumns,
  probs: sql<Record<string, number | null>>`jsonb_build_object(${sql.join(
    LIST_KEYS.map((k) => sql`${k}::text, ${P}->'probs'->${k}::text`),
    sql`, `
  )})`,
  pick: sql<MatchRow["pick"]>`(
    SELECT jsonb_build_object('key', p.key, 'prob', p.prob, 'modelProb', p.model_prob, 'odds', p.odds, 'verdict', p.verdict)
    FROM picks p WHERE p.match_id = ${matches.id} ORDER BY p.edge DESC LIMIT 1
  )`,
};

/** Upcoming matches (kicked off at most 3 hours ago), at most 200. */
const loadUpcomingMatches = cached("matches-upcoming", [TAG.matches, TAG.picks], async (): Promise<MatchRow[]> => {
  const db = getDb();
  return db
    .select(listColumns)
    .from(matches)
    .where(gte(matches.kickoff, new Date(Date.now() - 3 * 3_600_000)))
    .orderBy(asc(matches.kickoff))
    .limit(200);
});

export async function upcomingMatches(now = Date.now()) {
  return (await loadUpcomingMatches()).filter((m) => m.kickoff.getTime() >= now - 3 * 3_600_000);
}

/** Finished matches, newest first, one page at a time. */
export const finishedMatches = cached("matches-finished", [TAG.matches, TAG.picks], async (page: number) => {
  const db = getDb();
  const [rows, [{ total }]] = await Promise.all([
    db
      .select(listColumns)
      .from(matches)
      .where(eq(matches.status, "FINISHED"))
      .orderBy(desc(matches.kickoff))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(matches).where(eq(matches.status, "FINISHED")),
  ]);
  return { rows: rows as MatchRow[], total };
});

/** One match with everything the match page shows, and its picks (best edge first). */
export const matchDetail = cached(
  "match-detail",
  (id: string) => [TAG.matches, TAG.match(id), TAG.picks],
  async (id: string): Promise<{ match: Match | null; picks: Pick[] }> => {
    const db = getDb();
    const [[match], list] = await Promise.all([
      db.select().from(matches).where(eq(matches.id, id)),
      db.select().from(picks).where(eq(picks.matchId, id)).orderBy(desc(picks.edge)),
    ]);
    return { match: match ?? null, picks: list };
  }
);

/* ---------- performance ---------- */

export type HistoryView = "all" | "placed";
const viewWhere = (view: HistoryView) =>
  and(ne(picks.result, "PENDING"), view === "placed" ? eq(picks.status, "PLACED") : ne(picks.status, "SKIPPED"));
const decided = sql`${picks.result} IN ('WON', 'LOST')`;

/** Settled-bet totals, computed by Postgres (one row however many picks there are). Only WON / LOST count, like perf(). */
export const pickStats = cached("pick-stats", [TAG.picks, TAG.stats], async (view: HistoryView): Promise<Omit<PerfStats, "curve">> => {
  const db = getDb();
  const [r] = await db
    .select({
      n: sql<number>`count(*) FILTER (WHERE ${decided})::int`,
      wins: sql<number>`count(*) FILTER (WHERE ${picks.result} = 'WON')::int`,
      staked: sql<number>`coalesce(sum(${picks.stake}) FILTER (WHERE ${decided}), 0)::float8`,
      profit: sql<number>`coalesce(sum(${picks.profit}) FILTER (WHERE ${decided}), 0)::float8`,
      expectedWins: sql<number>`coalesce(sum(${picks.prob}) FILTER (WHERE ${decided}), 0)::float8`,
      avgClv: sql<number | null>`(avg(${picks.clv}) FILTER (WHERE ${decided}))::float8`,
      brier: sql<number | null>`(avg(power(${picks.prob} - CASE WHEN ${picks.result} = 'WON' THEN 1 ELSE 0 END, 2)) FILTER (WHERE ${decided}))::float8`,
    })
    .from(picks)
    .where(viewWhere(view));
  return { ...r, roi: r.staked > 0 ? r.profit / r.staked : 0, hitRate: r.n ? r.wins / r.n : 0 };
});

/** Most points the profit chart draws; longer histories are thinned evenly (the last point is kept). */
const CURVE_POINTS = 400;

/** Cumulative profit after each settled bet, oldest first, summed by Postgres. */
export const profitCurve = cached("profit-curve", [TAG.picks, TAG.stats, TAG.matches], async (view: HistoryView): Promise<PerfStats["curve"]> => {
  const db = getDb();
  const rows = await db
    .select({
      date: sql<string>`to_char(${matches.kickoff} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      profit: sql<number>`round(sum(coalesce(${picks.profit}, 0)) OVER (ORDER BY ${matches.kickoff}, ${picks.id})::numeric, 2)::float8`,
    })
    .from(picks)
    .innerJoin(matches, eq(picks.matchId, matches.id))
    .where(and(viewWhere(view), decided))
    .orderBy(asc(matches.kickoff), asc(picks.id));
  const curve = rows.map((r, i) => ({ i: i + 1, ...r }));
  if (curve.length <= CURVE_POINTS) return curve;
  const step = curve.length / CURVE_POINTS;
  return Array.from({ length: CURVE_POINTS }, (_, k) => curve[Math.min(curve.length - 1, Math.round((k + 1) * step) - 1)]);
});

/** One page of settled bets, newest first. */
export const settledPicks = cached("settled-picks", [TAG.picks, TAG.matches], async (view: HistoryView, page: number) => {
  const db = getDb();
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ pick: picks, match: liteColumns })
      .from(picks)
      .innerJoin(matches, eq(picks.matchId, matches.id))
      .where(viewWhere(view))
      .orderBy(desc(matches.kickoff), desc(picks.edge))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(picks).where(viewWhere(view)),
  ]);
  return { rows: rows.map((r) => ({ ...r.pick, match: r.match })) as PickLite[], total };
});

/* ---------- runs ---------- */

const runColumns = {
  id: runs.id,
  kind: runs.kind,
  startedAt: runs.startedAt,
  finishedAt: runs.finishedAt,
  matchesAnalysed: runs.matchesAnalysed,
  picksCount: runs.picksCount,
  settledCount: runs.settledCount,
  error: sql<boolean>`${runs.error} IS NOT NULL`,
};

/** The last daily run (with the AI briefing) and the 5 most recent runs. The long `log` column is left out. */
export const runsOverview = cached("runs", [TAG.runs], async () => {
  const db = getDb();
  const [[lastDaily], recent] = await Promise.all([
    db
      .select({ ...runColumns, summary: runs.summary })
      .from(runs)
      .where(eq(runs.kind, "DAILY"))
      .orderBy(desc(runs.startedAt))
      .limit(1),
    db.select(runColumns).from(runs).orderBy(desc(runs.startedAt)).limit(5),
  ]);
  return { lastDaily: lastDaily ?? null, recent };
});

/* ---------- logos ---------- */

/** Every known logo (a few hundred short rows), cached a day: logos only change with npm run logos:sync. */
export const allLogos = cached(
  "logos",
  [TAG.logos],
  async () => {
    const db = getDb();
    const [teams, leagues] = await Promise.all([
      db
        .select({ name: teamLogos.name, league: teamLogos.league, url: teamLogos.logoUrl })
        .from(teamLogos)
        .where(sql`${teamLogos.logoUrl} IS NOT NULL`),
      db.select({ code: leagueLogos.code, url: leagueLogos.logoUrl }).from(leagueLogos),
    ]);
    return { teams: teams.map((t) => [`${t.name}|${t.league}`, t.url!] as const), leagues: leagues.map((l) => [l.code, l.url] as const) };
  },
  86_400
);

/* ---------- tickets ---------- */

export type TicketRow = typeof tickets.$inferSelect & {
  legs: { matchId: string; key: string; odds: number; prob: number; result: string; home: string; away: string; league: string; homeGoals: number | null; awayGoals: number | null }[];
};

/** Saved tickets: settled totals and one page of tickets with their legs, newest first. */
export const ticketsOverview = cached("tickets", [TAG.tickets, TAG.matches], async (page: number) => {
  const db = getDb();
  const [[stats], list, [{ total }]] = await Promise.all([
    db
      .select({
        n: sql<number>`count(*) FILTER (WHERE ${tickets.status} IN ('WON', 'LOST'))::int`,
        wins: sql<number>`count(*) FILTER (WHERE ${tickets.status} = 'WON')::int`,
        open: sql<number>`count(*) FILTER (WHERE ${tickets.status} = 'PENDING')::int`,
        staked: sql<number>`coalesce(sum(${tickets.stake}) FILTER (WHERE ${tickets.status} IN ('WON', 'LOST')), 0)::float8`,
        profit: sql<number>`coalesce(sum(${tickets.profit}) FILTER (WHERE ${tickets.status} IN ('WON', 'LOST')), 0)::float8`,
        expectedWins: sql<number>`coalesce(sum(${tickets.prob}) FILTER (WHERE ${tickets.status} IN ('WON', 'LOST')), 0)::float8`,
      })
      .from(tickets),
    db.select().from(tickets).orderBy(desc(tickets.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(tickets),
  ]);
  const legs = list.length
    ? await db
        .select({
          ticketId: ticketLegs.ticketId,
          matchId: ticketLegs.matchId,
          key: ticketLegs.key,
          odds: ticketLegs.odds,
          prob: ticketLegs.prob,
          result: ticketLegs.result,
          home: matches.home,
          away: matches.away,
          league: matches.league,
          homeGoals: matches.homeGoals,
          awayGoals: matches.awayGoals,
        })
        .from(ticketLegs)
        .innerJoin(matches, eq(ticketLegs.matchId, matches.id))
        .where(inArray(ticketLegs.ticketId, list.map((t) => t.id)))
        .orderBy(asc(ticketLegs.id))
    : [];
  const rows: TicketRow[] = list.map((t) => ({ ...t, legs: legs.filter((l) => l.ticketId === t.id) }));
  return { stats: { ...stats, roi: stats.staked > 0 ? stats.profit / stats.staked : 0, hitRate: stats.n ? stats.wins / stats.n : 0 }, rows, total };
});

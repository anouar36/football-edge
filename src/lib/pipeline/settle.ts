import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { getReadyDb } from "../db";
import { invalidate, TAG } from "../cache";
import { matches, picks, runs, settings as settingsTable, ticketLegs, tickets } from "../schema";
import { fetchSeason, seasonCode, type HistMatch } from "../data/footballdata";
import { settleKey } from "../model/value";

type Db = Awaited<ReturnType<typeof getReadyDb>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const sameDay = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) < 36 * 3_600_000;
const cents = (x: number) => Math.round(x * 100) / 100;

/** Settle the ticket legs of these finished matches, then every ticket that is now decided. */
async function settleTickets(tx: Tx, finished: Map<string, HistMatch>) {
  if (!finished.size) return 0;
  const legs = await tx
    .select()
    .from(ticketLegs)
    .where(and(inArray(ticketLegs.matchId, Array.from(finished.keys())), eq(ticketLegs.result, "PENDING")));
  for (const l of legs) {
    const r = finished.get(l.matchId)!;
    await tx
      .update(ticketLegs)
      .set({ result: settleKey(l.key, r.hg, r.ag, r.hc, r.ac) })
      .where(and(eq(ticketLegs.id, l.id), eq(ticketLegs.result, "PENDING")));
  }
  const ids = Array.from(new Set(legs.map((l) => l.ticketId)));
  const open = ids.length ? await tx.select().from(tickets).where(and(inArray(tickets.id, ids), eq(tickets.status, "PENDING"))) : [];
  const all = open.length ? await tx.select().from(ticketLegs).where(inArray(ticketLegs.ticketId, open.map((t) => t.id))) : [];
  let n = 0;
  for (const t of open) {
    const ls = all.filter((l) => l.ticketId === t.id);
    // One lost leg loses the ticket, even before the other matches are played. VOID legs count as odds 1.00.
    const status = ls.some((l) => l.result === "LOST")
      ? "LOST"
      : ls.some((l) => l.result === "PENDING")
        ? null
        : ls.every((l) => l.result === "VOID")
          ? "VOID"
          : "WON";
    if (!status) continue;
    const odds = ls.reduce((a, l) => a * (l.result === "WON" ? l.odds : 1), 1);
    const profit = status === "WON" ? t.stake * (odds - 1) : status === "LOST" ? -t.stake : 0;
    const [done] = await tx
      .update(tickets)
      .set({ status, profit: cents(profit) })
      .where(and(eq(tickets.id, t.id), eq(tickets.status, "PENDING")))
      .returning({ id: tickets.id });
    if (done) n++;
  }
  return n;
}

/** Fill in results for finished matches and settle their picks. */
export async function runSettle(opts: { now?: Date; results?: HistMatch[] } = {}) {
  const db = await getReadyDb();
  const now = opts.now ?? new Date();
  const [run] = await db.insert(runs).values({ kind: "SETTLE", startedAt: now }).returning();
  try {
    const open = await db
      .select()
      .from(matches)
      .where(and(eq(matches.status, "SCHEDULED"), lt(matches.kickoff, new Date(now.getTime() - 2.5 * 3_600_000))));

    // The season file of each open match: a match from May is still settled from last season's file in July.
    const results: HistMatch[] = opts.results ?? [];
    if (!opts.results) {
      const files = Array.from(new Set(open.map((m) => `${m.league}|${seasonCode(m.kickoff)}`)));
      for (const f of files) {
        const [league, season] = f.split("|");
        results.push(...(await fetchSeason(league, season)));
      }
    }

    // One transaction, and every update only applies to a row that is still SCHEDULED / PENDING. A settle
    // started at the same time (cron and the button) waits for this one, then finds nothing left to do:
    // each pick, each ticket and the bankroll count once. The bankroll is added to, never overwritten.
    const out = await db.transaction(async (tx) => {
      let settled = 0;
      let bankrollDelta = 0;
      const finished = new Map<string, HistMatch>();
      for (const m of open) {
        const r = results.find((x) => x.league === m.league && x.home === m.home && x.away === m.away && sameDay(x.kickoff, m.kickoff));
        if (!r) continue;
        const [claimed] = await tx
          .update(matches)
          .set({ status: "FINISHED", homeGoals: r.hg, awayGoals: r.ag, homeCorners: r.hc, awayCorners: r.ac, closingOdds: r.closing, updatedAt: new Date() })
          .where(and(eq(matches.id, m.id), eq(matches.status, "SCHEDULED")))
          .returning({ id: matches.id });
        if (!claimed) continue;
        finished.set(m.id, r);
        for (const p of await tx.select().from(picks).where(and(eq(picks.matchId, m.id), eq(picks.result, "PENDING")))) {
          const result = settleKey(p.key, r.hg, r.ag, r.hc, r.ac);
          const profit = result === "WON" ? p.stake * (p.odds - 1) : result === "LOST" ? -p.stake : 0;
          const closing = r.closing[p.key] ?? null;
          // The status as it is now: Place / Skip may have changed it since the select above.
          const [row] = await tx
            .update(picks)
            .set({ result, profit: cents(profit), closingOdds: closing, clv: closing ? p.odds / closing - 1 : null })
            .where(and(eq(picks.id, p.id), eq(picks.result, "PENDING")))
            .returning({ status: picks.status });
          if (!row) continue;
          if (row.status === "PLACED") bankrollDelta += profit;
          settled++;
        }
      }
      const ticketsSettled = await settleTickets(tx, finished);
      if (bankrollDelta !== 0) {
        await tx
          .update(settingsTable)
          .set({ bankroll: sql`round((${settingsTable.bankroll} + ${bankrollDelta})::numeric, 2)`, updatedAt: new Date() })
          .where(eq(settingsTable.id, 1));
      }
      return { settled, bankrollDelta, ticketsSettled, matches: finished.size };
    });

    await db
      .update(runs)
      .set({
        finishedAt: new Date(),
        settledCount: out.settled,
        log: `${open.length} open matches, ${out.matches} finished, ${out.settled} picks settled, ${out.ticketsSettled} tickets settled, bankroll ${out.bankrollDelta >= 0 ? "+" : ""}${out.bankrollDelta.toFixed(2)}`,
      })
      .where(eq(runs.id, run.id));
    // Results, picks, tickets and the bankroll (settings) changed in one transaction.
    await invalidate(TAG.matches, TAG.picks, TAG.stats, TAG.tickets, TAG.settings, TAG.runs);
    return { settled: out.settled, bankrollDelta: out.bankrollDelta, ticketsSettled: out.ticketsSettled };
  } catch (e) {
    await db.update(runs).set({ finishedAt: new Date(), error: (e as Error).stack ?? String(e) }).where(eq(runs.id, run.id));
    await invalidate(TAG.runs);
    throw e;
  }
}

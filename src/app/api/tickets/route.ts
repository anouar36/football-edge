import { NextResponse } from "next/server";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { denyAnonymous } from "@/lib/auth/server";
import { getReadyDb, getSettings } from "@/lib/db";
import { invalidate, TAG } from "@/lib/cache";
import { maxStake } from "@/lib/bankroll";
import { matches, ticketLegs, tickets } from "@/lib/schema";
import { legId, ticketMath, type TicketLeg } from "@/lib/model/ticket";
import type { PredictionJson } from "@/lib/queries";
import { legFromLite, liteOf } from "@/lib/ticket-legs";

const body = z.object({
  stake: z.number().positive().max(1e7),
  legs: z
    .array(z.object({ matchId: z.string().min(1).max(200), key: z.string().regex(/^[A-Z0-9.]+:[A-Z0-9]+$/), odds: z.number().gt(1).max(1000) }))
    .min(1)
    .max(20),
});

/** `code` lets the panel show the message in the interface language. */
const fail = (code: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error: code, code, ...extra }, { status });

/**
 * Saves the ticket from the panel. Only the matches, markets, odds and stake come from the page:
 * probabilities, total odds and EV are computed again here with the same maths (lib/model/ticket.ts).
 */
export async function POST(req: Request) {
  const denied = await denyAnonymous();
  if (denied) return denied;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("BAD_REQUEST", 400);
  const { stake, legs: input } = parsed.data;
  if (new Set(input.map(legId)).size !== input.length) return fail("DUPLICATE_LEG", 400);

  const db = await getReadyDb();
  const [settings, rows] = await Promise.all([getSettings(), db.select().from(matches).where(inArray(matches.id, Array.from(new Set(input.map((l) => l.matchId)))))]);
  // Every saved stake respects the max stake per bet (Settings), like the picks.
  const cap = maxStake(settings);
  if (stake > cap + 0.01) return fail("STAKE_ABOVE_MAX", 400, { max: Math.floor(cap * 100) / 100 });

  const byId = new Map(rows.map((m) => [m.id, m]));
  const legs: TicketLeg[] = [];
  for (const l of input) {
    const m = byId.get(l.matchId);
    if (!m) return fail("NOT_FOUND", 404);
    // Results are only known for matches still SCHEDULED at settlement; a started match is priced in play.
    if (m.status !== "SCHEDULED" || m.kickoff <= new Date()) return fail("STARTED", 409);
    const p = m.prediction as PredictionJson | null;
    const leg = legFromLite(liteOf(m), l.key, p?.probs[l.key], settings.modelWeight, { blend: p?.candidates?.find((c) => c.key === l.key)?.prob });
    if (!leg) return fail("NO_PREDICTION", 409);
    legs.push({ ...leg, odds: l.odds });
  }
  const math = ticketMath(legs);
  if (math.contradictory) return fail("CONTRADICTION", 400);

  const ticket = await db.transaction(async (tx) => {
    const [row] = await tx.insert(tickets).values({ stake, totalOdds: math.totalOdds!, prob: math.prob, ev: math.ev! }).returning();
    await tx.insert(ticketLegs).values(legs.map((l) => ({ ticketId: row.id, matchId: l.matchId, key: l.key, label: l.label, odds: l.odds!, prob: l.prob })));
    return row;
  });
  await invalidate(TAG.tickets);
  return NextResponse.json({ ticket, legs: legs.length }, { status: 201 });
}

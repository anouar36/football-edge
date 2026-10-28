import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getReadyDb, getSettings } from "@/lib/db";
import { matches, picks } from "@/lib/schema";
import { pred } from "@/lib/queries";
import { DISPLAY_KEYS, marketLabel } from "@/lib/model/markets";
import { priceCheck } from "@/lib/model/value";
import { denyAnonymous } from "@/lib/auth/server";
import { invalidate, TAG } from "@/lib/cache";

const body = z.object({
  key: z.string().refine((k) => DISPLAY_KEYS.includes(k)),
  odds: z.number().gt(1).lt(1000),
  status: z.enum(["SUGGESTED", "PLACED"]),
});

/** `error` is a code the page translates. */
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Saves a bet priced from a bookmaker screenshot as a pick, so it shows in Picks,
 * Bet slip and Performance and is settled like the model's own. Probability, edge
 * and stake are recomputed here; only the key, the odds and the status come from the page.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await denyAnonymous();
  if (denied) return denied;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("bad_request", 400);
  const { key, odds, status } = parsed.data;

  const id = decodeURIComponent(params.id);
  const db = await getReadyDb();
  const [[match], [existing], settings] = await Promise.all([
    db.select().from(matches).where(eq(matches.id, id)),
    db.select().from(picks).where(and(eq(picks.matchId, id), eq(picks.key, key))),
    getSettings(),
  ]);
  if (!match) return fail("not_found", 404);
  // The probabilities are pre-match, and settlement only looks at scheduled matches.
  if (match.status !== "SCHEDULED" || match.kickoff <= new Date()) return fail("started", 409);
  if (existing && existing.result !== "PENDING") return fail("settled", 409);
  const p = pred(match);
  const modelProb = p?.probs[key];
  if (!p || modelProb == null) return fail("no_prediction", 409);
  const price = priceCheck(modelProb, odds, settings);
  if (price.stake <= 0) return fail("no_value", 400);

  const [market, selection] = key.split(":");
  const data = {
    market,
    selection,
    label: marketLabel(key, match.home, match.away),
    modelProb,
    // The de-margined market average when the data source priced this market, else this bookmaker's implied probability.
    marketProb: p.candidates?.find((c) => c.key === key)?.marketProb ?? 1 / odds,
    prob: modelProb,
    odds,
    edge: price.edge,
    kelly: price.kelly,
    stakePct: price.stakePct,
    stake: price.stake,
    status,
    source: "SCREENSHOT",
    runDate: new Date(),
  };
  const [pick] = await db
    .insert(picks)
    .values({ matchId: id, key, ...data })
    .onConflictDoUpdate({ target: [picks.matchId, picks.key], set: data })
    .returning();
  await invalidate(TAG.picks, TAG.stats, TAG.match(id));
  return NextResponse.json({ pick, updated: Boolean(existing) });
}

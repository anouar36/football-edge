import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { getDb, getSettings } from "@/lib/db";
import { picks } from "@/lib/schema";
import { denyAnonymous } from "@/lib/auth/server";
import { invalidate, TAG } from "@/lib/cache";

const body = z.object({ status: z.enum(["SUGGESTED", "PLACED", "SKIPPED"]) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const denied = await denyAnonymous();
  if (denied) return denied;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "status must be SUGGESTED, PLACED or SKIPPED" }, { status: 400 });
  const db = getDb();
  const placing = parsed.data.status === "PLACED";
  const s = placing ? await getSettings() : null;
  // Only while the pick is open: the settlement may finish between a check and the update.
  // Placing fixes the stake from today's bankroll and max stake: it was sized from the bankroll of the
  // analysis day, which may have changed since (a 1000 MAD stake on a 20 MAD bankroll).
  const [updated] = await db
    .update(picks)
    .set({
      status: parsed.data.status,
      ...(s && {
        stakePct: sql`least(${picks.stakePct}, ${s.maxStakePct})`,
        stake: sql`round((${Math.max(0, s.bankroll)} * least(${picks.stakePct}, ${s.maxStakePct}))::numeric, 2)`,
      }),
    })
    .where(and(eq(picks.id, params.id), eq(picks.result, "PENDING")))
    .returning();
  if (updated) {
    await invalidate(TAG.picks, TAG.stats);
    return NextResponse.json(updated);
  }
  const [pick] = await db.select({ id: picks.id }).from(picks).where(eq(picks.id, params.id));
  return pick
    ? NextResponse.json({ error: "This bet is already settled" }, { status: 409 })
    : NextResponse.json({ error: "Pick not found" }, { status: 404 });
}

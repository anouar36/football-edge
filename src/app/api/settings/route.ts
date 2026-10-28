import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getReadyDb } from "@/lib/db";
import { picks, settings } from "@/lib/schema";
import { invalidate, TAG } from "@/lib/cache";
import { settingsSchema } from "@/lib/settings-schema";
import { denyAnonymous } from "@/lib/auth/server";

/** `field` and `code` let the settings form show the error in the interface language. */
export async function PUT(req: Request) {
  const denied = await denyAnonymous();
  if (denied) return denied;
  const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: `${first.path.join(".")}: ${first.message}`, field: String(first.path[0] ?? "") }, { status: 400 });
  }
  if (parsed.data.minOdds >= parsed.data.maxOdds) {
    return NextResponse.json({ error: "Minimum odds must be below maximum odds", code: "ODDS_RANGE" }, { status: 400 });
  }
  const db = await getReadyDb();
  const s = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(settings)
      .values({ id: 1, ...parsed.data })
      .onConflictDoUpdate({ target: settings.id, set: { ...parsed.data, updatedAt: new Date() } })
      .returning();
    // Open suggestions follow the new bankroll and max stake (placed bets keep the stake that was placed).
    await tx
      .update(picks)
      .set({
        stakePct: sql`least(${picks.stakePct}, ${row.maxStakePct})`,
        stake: sql`round((${row.bankroll} * least(${picks.stakePct}, ${row.maxStakePct}))::numeric, 2)`,
      })
      .where(and(eq(picks.result, "PENDING"), eq(picks.status, "SUGGESTED")));
    return row;
  });
  await invalidate(TAG.settings, TAG.picks);
  return NextResponse.json(s);
}

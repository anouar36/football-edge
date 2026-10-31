import { NextResponse } from "next/server";
import { runDaily, RunInProgressError } from "@/lib/pipeline/daily";
import { runSettle } from "@/lib/pipeline/settle";
import { safeEqual } from "@/lib/auth/timing-safe";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Called by Vercel Cron (sends "Authorization: Bearer $CRON_SECRET"). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const settled = await runSettle();
    const daily = await runDaily();
    return NextResponse.json({ ok: true, settled: settled.settled, matches: daily.matches, picks: daily.picks });
  } catch (e) {
    if (e instanceof RunInProgressError) return NextResponse.json({ error: e.message, code: "RUN_IN_PROGRESS" }, { status: 409 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

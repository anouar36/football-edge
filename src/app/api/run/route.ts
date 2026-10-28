import { NextResponse } from "next/server";
import { runDaily, RunInProgressError } from "@/lib/pipeline/daily";
import { runSettle } from "@/lib/pipeline/settle";
import { denyAnonymous } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** "Run analysis now" button. Signed-in users only. */
export async function POST() {
  const denied = await denyAnonymous();
  if (denied) return denied;
  try {
    await runSettle();
    const r = await runDaily();
    return NextResponse.json({ ok: true, matches: r.matches, picks: r.picks });
  } catch (e) {
    if (e instanceof RunInProgressError) return NextResponse.json({ error: e.message, code: "RUN_IN_PROGRESS" }, { status: 409 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

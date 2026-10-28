import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { TAG_PATTERN } from "@/lib/cache";

const body = z.object({ tags: z.array(z.string().regex(TAG_PATTERN)).min(1).max(50) });

/**
 * Clears cached page data after a write made outside the app: `npm run job:daily` (GitHub Actions),
 * `npm run logos:sync`, `npm run seed:demo` call it through invalidate() in lib/cache.ts.
 * Same secret as the cron ("Authorization: Bearer $CRON_SECRET").
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "tags: a list of known cache tags" }, { status: 400 });
  for (const tag of parsed.data.tags) revalidateTag(tag);
  return NextResponse.json({ ok: true, tags: parsed.data.tags });
}

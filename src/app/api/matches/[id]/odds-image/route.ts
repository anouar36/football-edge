import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getReadyDb, getSettings } from "@/lib/db";
import { matches } from "@/lib/schema";
import { pred } from "@/lib/queries";
import { activeProvider, getProvider, type OddsImage } from "@/lib/llm";
import { DISPLAY_KEYS } from "@/lib/model/markets";
import { priceCheck } from "@/lib/model/value";
import { denyAnonymous } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
// A vision call takes roughly 5 to 40 seconds.
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;

/** The real format from the file's first bytes: the type the browser claims is not trusted. */
function sniff(b: Buffer): OddsImage["mediaType"] | null {
  if (b.toString("latin1", 0, 8) === "\x89PNG\r\n\x1a\n") return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** `error` is a code the page translates. */
const fail = (error: string, status: number, extra?: Record<string, string>) => NextResponse.json({ error, ...extra }, { status });

/**
 * Reads the odds in one bookmaker screenshot (multipart field "image") and prices
 * each market with the model. The image is only held in memory for this request.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await denyAnonymous();
  if (denied) return denied;
  const files = (await req.formData().catch(() => null))?.getAll("image") ?? [];
  const file = files[0];
  if (files.length !== 1 || !(file instanceof File) || file.size === 0) return fail("no_file", 400);
  if (file.size > MAX_BYTES) return fail("too_large", 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  const mediaType = sniff(bytes);
  if (!mediaType) return fail("bad_type", 415);

  const id = decodeURIComponent(params.id);
  const db = await getReadyDb();
  const [[match], settings] = await Promise.all([db.select().from(matches).where(eq(matches.id, id)), getSettings()]);
  if (!match) return fail("not_found", 404);
  const p = pred(match);
  if (!p) return fail("no_prediction", 409);

  const llm = getProvider(settings);
  if (!llm) {
    const a = activeProvider(settings);
    return fail("no_key", 400, { provider: a.name, keyEnv: a.keyEnv });
  }
  const read = await llm.extractOdds({ data: bytes.toString("base64"), mediaType }, { home: match.home, away: match.away });
  if (!read) return fail("read_failed", 502, { provider: llm.name });

  const markets = DISPLAY_KEYS.flatMap((key) => {
    const m = read.markets.find((x) => x.key === key);
    const prob = p.probs[key];
    return m && prob != null ? [{ key, rawLabel: m.rawLabel, odds: m.odds, ...priceCheck(prob, m.odds, settings) }] : [];
  });

  return NextResponse.json({
    provider: { name: llm.name, model: llm.model },
    bookmaker: read.bookmaker ?? null,
    home: read.home ?? null,
    away: read.away ?? null,
    warning: read.sameMatch === false ? "teams_mismatch" : null,
    markets,
    // Read from the image, but the model has no probability for them (e.g. corners without corner data).
    unpriced: read.markets.length - markets.length,
  });
}

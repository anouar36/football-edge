import { NextResponse } from "next/server";
import { z } from "zod";
import { denyAnonymous } from "@/lib/auth/server";
import { cachedSettings } from "@/lib/data";
import { activeProvider } from "@/lib/llm";
import { explainSystemPrompt, explainUserPrompt, streamExplanation } from "@/lib/llm/ticket-explain";

export const maxDuration = 60;

const leg = z.object({
  match: z.string().max(120),
  label: z.string().max(120),
  odds: z.number().gt(1).max(1000).nullable(),
  prob: z.number().min(0).max(1),
  edge: z.number().min(-1).max(1000).nullable(),
  modelOnly: z.boolean(),
  sameMatch: z.boolean(),
  review: z.string().max(300).nullable(),
});
const body = z.object({
  name: z.string().max(40),
  currency: z.string().max(6),
  stake: z.number().min(0).max(1e7),
  prob: z.number().min(0).max(1),
  totalOdds: z.number().nullable(),
  ev: z.number().nullable(),
  margin: z.number().nullable(),
  legs: z.array(leg).min(1).max(20),
  tips: z.array(z.string().max(600)).max(15),
});

/** Streams a short explanation of the ticket (plain text) in the analysis language from Settings. */
export async function POST(req: Request) {
  // Not a data write, but every call is paid for: same check as the writes.
  const denied = await denyAnonymous();
  if (denied) return denied;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid ticket" }, { status: 400 });
  const settings = await cachedSettings();
  const p = activeProvider(settings);
  if (!p.keySet) return NextResponse.json({ error: `${p.name} is selected but ${p.keyEnv} is not set.`, code: "NO_KEY" }, { status: 400 });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  const chunks = streamExplanation(p.id, p.model, explainSystemPrompt(settings.language, settings.displayName), explainUserPrompt(parsed.data), ctrl.signal);
  // Wait for the first words, so a failing provider answers with an error status instead of an empty 200.
  let first: IteratorResult<string>;
  try {
    first = await chunks.next();
  } catch (e) {
    clearTimeout(timer);
    console.error(`[explain] ${p.name} failed:`, (e as Error).message);
    return NextResponse.json({ error: `${p.name} could not answer.` }, { status: 502 });
  }
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) controller.enqueue(enc.encode(first.value));
        for await (const c of chunks) controller.enqueue(enc.encode(c));
      } catch (e) {
        console.error(`[explain] ${p.name} stopped:`, (e as Error).message);
      } finally {
        clearTimeout(timer);
        controller.close();
      }
    },
    cancel() {
      clearTimeout(timer);
      ctrl.abort();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}

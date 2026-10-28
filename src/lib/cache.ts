import { cache } from "react";
import { revalidateTag, unstable_cache } from "next/cache";

/*
 * Shared data cache for the pages (Next.js Data Cache: in .next/cache locally, Vercel's data cache
 * in production). Only data that is the same for every signed-in user goes here: settings, matches,
 * picks, runs, stats, logos, tickets. Never the session, the user or anything from /api/auth.
 *
 * Every write invalidates its tags right after it commits (invalidate() below), so a page never shows
 * stale data after an action in the app. REVALIDATE is only a safety net for writes made outside the
 * app, e.g. the GitHub Actions job when APP_URL is not set (see scripts and /api/cron/revalidate).
 */

export const TAG = {
  settings: "settings",
  matches: "matches",
  match: (id: string) => `match:${id}`,
  picks: "picks",
  runs: "runs",
  stats: "stats",
  logos: "logos",
  tickets: "tickets",
} as const;

/** Every shared tag (match:<id> tags are covered by "matches"). */
export const ALL_TAGS = [TAG.settings, TAG.matches, TAG.picks, TAG.runs, TAG.stats, TAG.logos, TAG.tickets];

/** Tags a script may ask /api/cron/revalidate to clear. */
export const TAG_PATTERN = /^(settings|matches|picks|runs|stats|logos|tickets|match:[\w.:-]{1,200})$/;

/** Seconds before a cached read is refreshed even without an invalidation. */
export const REVALIDATE = 600;

// React's per-render cache() exists in the React that Next.js bundles for server components, not in
// the react package the scripts load (18.3): there each call just runs.
const dedupe: <F extends (...args: never[]) => unknown>(fn: F) => F = typeof cache === "function" ? cache : (fn) => fn;

// unstable_cache stores JSON: Date columns come back as strings on a cache hit (but as Dates on a miss).
const DATE_KEYS = new Set(["kickoff", "startedAt", "finishedAt", "createdAt", "updatedAt", "runDate", "checkedAt"]);
function reviveDates<T>(v: T): T {
  if (Array.isArray(v)) v.forEach(reviveDates);
  else if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      if (DATE_KEYS.has(k) && typeof o[k] === "string") o[k] = new Date(o[k] as string);
      else reviveDates(o[k]);
    }
  }
  return v;
}

/**
 * `load` cached under `key` (plus its arguments) and `tags`. Arguments must be JSON-serialisable;
 * they are part of the cache key. Within one render, the same call is also shared (React cache), so
 * a page and a streamed section can both ask for it.
 */
export function cached<A extends unknown[], R>(
  key: string,
  tags: string[] | ((...args: A) => string[]),
  load: (...args: A) => Promise<R>,
  revalidate = REVALIDATE
): (...args: A) => Promise<R> {
  return dedupe(async (...args: A) => {
    const t = typeof tags === "function" ? tags(...args) : tags;
    return reviveDates(await unstable_cache(() => load(...args), [key, JSON.stringify(args)], { tags: t, revalidate })());
  });
}

/**
 * Call after a write commits. Inside the app (route handlers, the cron and "Run analysis now") the
 * cache is cleared at once. In a script (npm run job:daily, logos:sync, seed:demo) there is no Next.js
 * cache to clear here, so it asks the deployed app to do it (APP_URL + CRON_SECRET); without those
 * the pages catch up within REVALIDATE seconds.
 */
export async function invalidate(...tags: string[]) {
  try {
    for (const t of tags) revalidateTag(t);
    return;
  } catch {
    // Outside a Next.js request: fall through to the HTTP call.
  }
  const url = process.env.APP_URL?.replace(/\/$/, "");
  const secret = process.env.CRON_SECRET;
  if (!url || !secret) {
    console.log(`[cache] set APP_URL and CRON_SECRET to refresh the app's cache now; otherwise pages update within ${REVALIDATE / 60} minutes`);
    return;
  }
  try {
    const r = await fetch(`${url}/api/cron/revalidate`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ tags }),
    });
    console.log(`[cache] ${url}: ${r.ok ? "cleared" : `could not clear (${r.status})`} ${tags.join(", ")}`);
  } catch (e) {
    console.warn(`[cache] ${url} unreachable: ${(e as Error).message}`);
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { isAllowedEmail } from "@/lib/auth/allowlist";
import { cachedSessionEmail } from "@/lib/auth/session-cookie";

/**
 * Every page and API route needs a valid session, except the login page, the
 * Better Auth endpoints and the cron endpoint (which checks CRON_SECRET itself).
 * Pages redirect to /login?next=<path>; API routes answer 401 JSON.
 *
 * Fast path, on almost every request: the signed session copy in the cookie cache
 * (see lib/auth/session-cookie.ts) is checked here, with no network call and no database.
 * When it is missing or older than 5 minutes, the middleware asks /api/auth/get-session
 * (the Edge runtime cannot reach Postgres). That checks the session in the database,
 * drops one signed out from another device, and renews both cookies: they are forwarded
 * to the browser and to this request, so the page reads the fresh copy too.
 * Routes that write check the database again (denyAnonymous).
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/") || pathname.startsWith("/api/cron/")) return NextResponse.next();

  if (isAllowedEmail(await cachedSessionEmail(req))) return NextResponse.next();

  const { ok, setCookies } = await checkSession(req);
  const res = !ok
    ? pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(loginUrl(req, pathname + search))
    : setCookies.length
      ? NextResponse.next({ request: { headers: withCookies(req, setCookies) } })
      : NextResponse.next();
  for (const c of setCookies) res.headers.append("set-cookie", c);
  return res;
}

async function checkSession(req: NextRequest): Promise<{ ok: boolean; setCookies: string[] }> {
  if (!getSessionCookie(req)) return { ok: false, setCookies: [] };
  const headers = new Headers({ cookie: req.headers.get("cookie") ?? "" });
  // Better Auth rate-limits per client IP.
  const ip = req.headers.get("x-forwarded-for");
  if (ip) headers.set("x-forwarded-for", ip);
  try {
    const r = await fetch(new URL("/api/auth/get-session", req.nextUrl.origin), { headers, cache: "no-store" });
    const session = r.ok ? ((await r.json()) as { user?: { email?: string } } | null) : null;
    return { ok: isAllowedEmail(session?.user?.email), setCookies: r.headers.getSetCookie() };
  } catch {
    return { ok: false, setCookies: [] };
  }
}

/** The request headers with the renewed cookies applied (an expired cookie is removed). */
function withCookies(req: NextRequest, setCookies: string[]) {
  const jar = new Map(req.cookies.getAll().map((c) => [c.name, c.value]));
  for (const line of setCookies) {
    const [pair, ...attrs] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq < 1) continue;
    const name = pair.slice(0, eq).trim();
    const expired = attrs.some((a) => /^\s*max-age\s*=\s*0\s*$/i.test(a));
    if (expired) jar.delete(name);
    else jar.set(name, pair.slice(eq + 1).trim());
  }
  const headers = new Headers(req.headers);
  headers.set("cookie", Array.from(jar, ([k, v]) => `${k}=${v}`).join("; "));
  return headers;
}

function loginUrl(req: NextRequest, next: string) {
  const url = new URL("/login", req.nextUrl.origin);
  if (next !== "/") url.searchParams.set("next", next);
  return url;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

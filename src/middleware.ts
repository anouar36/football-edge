import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { isAllowedEmail } from "@/lib/auth/allowlist";
import { cachedSessionEmail } from "@/lib/auth/session-cookie";

/**
 * Fast-path authentication at the edge.
 *
 * 1. Public endpoints (/login, /api/auth/*, /api/cron/*) pass through immediately.
 * 2. Unauthenticated visitors (no session cookie) are rejected at 0ms:
 *    - Pages redirect to /login?next=<path>
 *    - API routes return 401 JSON
 * 3. Fast verification: checks the cryptographically signed cookie cache with zero
 *    network or database overhead.
 * 4. Cache-miss fallback: lets the request proceed to the Node.js runtime (AppLayout
 *    for pages, denyAnonymous() for mutating APIs) which verifies the session in-process
 *    against the database, eliminating slow Edge-to-Serverless HTTP subrequests.
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/") || pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  // 1. Fast rejection if no session cookie exists
  if (!getSessionCookie(req)) {
    return pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(loginUrl(req, pathname + search));
  }

  // 2. Fast authorization via signed session cookie cache (0ms, no DB)
  const cachedEmail = await cachedSessionEmail(req);
  if (cachedEmail) {
    if (isAllowedEmail(cachedEmail)) {
      return NextResponse.next();
    }
    // Signed session belongs to an email no longer allowed
    return pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Forbidden" }, { status: 403 })
      : NextResponse.redirect(loginUrl(req, pathname + search));
  }

  // 3. Cookie exists but cache is expired/missing: proceed directly to the Node.js
  // layer (AppLayout / API handler), where getSession() / denyAnonymous() validates
  // against the database in-process without an expensive Edge-to-Serverless HTTP waterfall.
  return NextResponse.next();
}

function loginUrl(req: NextRequest, next: string) {
  const url = new URL("/login", req.nextUrl.origin);
  if (next !== "/") url.searchParams.set("next", next);
  return url;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)"],
};

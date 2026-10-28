import { getCookieCache, getSessionCookie } from "better-auth/cookies";

/*
 * The middleware's fast path (Edge runtime: no database, no Node APIs). Better Auth keeps a signed
 * copy of the session in the "session_data" cookie (cookieCache in server.ts). Its HMAC uses
 * BETTER_AUTH_SECRET, so it cannot be forged or edited, and it stops being valid after
 * COOKIE_CACHE_SECONDS.
 */

/** How long the signed session copy is trusted before the database is asked again. */
export const COOKIE_CACHE_SECONDS = 5 * 60;

/**
 * Email of the signed-in user from the cookie cache, or null when the copy is missing, expired,
 * badly signed, or belongs to another session token than the session cookie.
 */
export async function cachedSessionEmail(req: Request): Promise<string | null> {
  const secret = process.env.BETTER_AUTH_SECRET;
  const token = getSessionCookie(req);
  if (!secret || !token) return null;
  try {
    // Same rule as useSecureCookies in server.ts, so both pick the same (__Secure-) cookie name.
    const cached = await getCookieCache(req, { secret, isSecure: process.env.NODE_ENV === "production" });
    // The session cookie is "<token>.<signature>"; both cookies must describe the same session.
    if (!cached || cached.session.token !== token.split(".")[0]) return null;
    return typeof cached.user.email === "string" ? cached.user.email : null;
  } catch {
    return null;
  }
}

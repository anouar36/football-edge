import { cache } from "react";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthEndpoint, createAuthMiddleware, sensitiveSessionMiddleware } from "better-auth/api";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/schema";
import { authAccounts, authRateLimits, authSessions, authUsers, authVerifications } from "@/lib/schema";
import { allowedEmails, isAllowedEmail } from "./allowlist";
import { COOKIE_CACHE_SECONDS } from "./session-cookie";

/*
 * Email + password login (Better Auth, self-managed on the app's database).
 * Only emails in ALLOWED_EMAILS get in, checked here on the server:
 * - sign-in and sign-up refuse other emails before the password is checked;
 * - sign-up only works while there is no account yet (first run);
 * - every new user and every new session is checked again in the database hooks;
 * - getSession() and the middleware drop a session whose email left the list.
 * Secrets: BETTER_AUTH_SECRET (required in production), BETTER_AUTH_URL (optional).
 */

/** `code` in the JSON error body; the login page translates it. */
export const NOT_ALLOWED = "EMAIL_NOT_ALLOWED";
export const SIGN_UP_CLOSED = "SIGN_UP_CLOSED";

const notAllowed = () => APIError.from("FORBIDDEN", { code: NOT_ALLOWED, message: "This email is not allowed" });

/**
 * "Add a person" in Settings → Security: POST /api/auth/add-user. A signed-in user
 * creates the account of another email from ALLOWED_EMAILS, with a temporary password
 * to pass on. Sign-up closes after the first account, so this is how the others get in.
 * A Better Auth endpoint (not a Next route) so it gets the session, origin and rate-limit checks.
 */
const addUser = {
  id: "add-user",
  endpoints: {
    addUser: createAuthEndpoint(
      "/add-user",
      {
        method: "POST",
        // Checks the session in the database, not the 5-minute cookie cache: a revoked session cannot add people.
        use: [sensitiveSessionMiddleware],
        body: z.object({ email: z.email(), name: z.string().trim().min(1).max(80), password: z.string() }),
      },
      async (ctx) => {
        const email = ctx.body.email.toLowerCase();
        if (!isAllowedEmail(ctx.context.session.user.email) || !isAllowedEmail(email)) throw notAllowed();
        const { password, internalAdapter } = ctx.context;
        if (ctx.body.password.length < password.config.minPasswordLength) throw APIError.from("BAD_REQUEST", { code: "PASSWORD_TOO_SHORT", message: "Password too short" });
        if (ctx.body.password.length > password.config.maxPasswordLength) throw APIError.from("BAD_REQUEST", { code: "PASSWORD_TOO_LONG", message: "Password too long" });
        if (await internalAdapter.findUserByEmail(email)) throw APIError.from("UNPROCESSABLE_ENTITY", { code: "USER_ALREADY_EXISTS", message: "User already exists." });
        const user = await internalAdapter.createUser({ email, name: ctx.body.name }, { method: "admin" });
        await internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: await password.hash(ctx.body.password) });
        return ctx.json({ user: { id: user.id, name: user.name, email: user.email } });
      }
    ),
  },
} satisfies BetterAuthPlugin;

function createAuth(db: NodePgDatabase<typeof schema>) {
  return betterAuth({
    appName: "EdgeXI",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: authUsers, session: authSessions, account: authAccounts, verification: authVerifications, rateLimit: authRateLimits },
    }),
    // Passwords: 8 to 128 characters, hashed with scrypt.
    emailAndPassword: { enabled: true },
    session: {
      // A signed copy of the session in a cookie (HMAC with BETTER_AUTH_SECRET), valid 5 minutes: the
      // middleware and getSession() read it without the database. After 5 minutes the middleware asks
      // /api/auth/get-session again, which checks the database and renews it. So a session signed out
      // from another device can still read pages for at most 5 minutes; writes always check the database
      // (denyAnonymous).
      cookieCache: { enabled: true, maxAge: COOKIE_CACHE_SECONDS },
    },
    rateLimit: {
      enabled: true,
      // In the database so the count holds across serverless instances. Keyed by client IP and path.
      storage: "database",
      customRules: {
        "/sign-in/email": { window: 300, max: 5 },
        "/sign-up/email": { window: 300, max: 5 },
        "/change-password": { window: 300, max: 5 },
        // Read-only and needs a signed session token: the two rate-limit queries per call cost more than they protect.
        "/get-session": false,
      },
    },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    user: {
      // Runs before any user row is created (first-run sign-up and "Add a person").
      validateUserInfo: ({ user }) => (isAllowedEmail(user.email) ? undefined : { error: NOT_ALLOWED, errorDescription: "This email is not allowed" }),
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const [user] = await db.select({ email: authUsers.email }).from(authUsers).where(eq(authUsers.id, session.userId));
            if (!isAllowedEmail(user?.email)) throw notAllowed();
          },
        },
      },
    },
    plugins: [addUser],
    // Not used by the app, and it trusts the cookie cache: a revoked session could rename the user for 5 minutes.
    disabledPaths: ["/update-user"],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email" && ctx.path !== "/sign-up/email") return;
        if (!isAllowedEmail(ctx.body?.email)) throw notAllowed();
        if (ctx.path === "/sign-up/email" && (await ctx.context.internalAdapter.countTotalUsers()) > 0) {
          throw APIError.from("FORBIDDEN", { code: SIGN_UP_CLOSED, message: "Sign-up is closed" });
        }
      }),
    },
  });
}

type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth["$Infer"]["Session"];

const g = globalThis as unknown as { auth?: Auth };

/** Created on first use (not at import), so `next build` does not need the database. */
export async function getAuth(): Promise<Auth> {
  if (!g.auth) {
    const db = getDb();
    g.auth = createAuth(db);
  }
  return g.auth;
}

/**
 * The signed-in session for this request, or null (also when the email is no longer allowed).
 * Read from the signed cookie cache when it is fresh (no database), once per request: the layout,
 * the page and the ticket panel share the result. Never cached across requests.
 */
export const getSession = cache(async (): Promise<AuthSession | null> => {
  const s = await (await getAuth()).api.getSession({ headers: headers() });
  return s && isAllowedEmail(s.user.email) ? s : null;
});

/** Like getSession(), but always checked against the database: a session signed out elsewhere fails at once. */
async function getVerifiedSession(): Promise<AuthSession | null> {
  const s = await (await getAuth()).api.getSession({ headers: headers(), query: { disableCookieCache: true } });
  return s && isAllowedEmail(s.user.email) ? s : null;
}

/**
 * For route handlers that change data: `const denied = await denyAnonymous(); if (denied) return denied;`
 * The middleware checks first; this keeps writes closed if the middleware is ever bypassed, and
 * skips the cookie cache so a revoked session cannot write.
 */
export async function denyAnonymous(): Promise<NextResponse | null> {
  return (await getVerifiedSession()) ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** True before the first account exists: the login page then shows "Create your account". */
export async function isFirstRun(): Promise<boolean> {
  const db = getDb();
  const [any] = await db.select({ id: authUsers.id }).from(authUsers).limit(1);
  return !any;
}

/** Each email of ALLOWED_EMAILS with its account's name, or null when it has no account yet. */
export async function peopleWithAccess(): Promise<{ email: string; name: string | null }[]> {
  const db = getDb();
  const users = await db.select({ name: authUsers.name, email: authUsers.email }).from(authUsers);
  const names = new Map(users.map((u) => [u.email.toLowerCase(), u.name]));
  return allowedEmails().map((email) => ({ email, name: names.get(email) ?? null }));
}

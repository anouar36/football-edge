/*
 * Who may sign in: the emails in ALLOWED_EMAILS (comma separated, any case).
 * No imports, so the middleware (Edge runtime) can use it too.
 */

const normalize = (email: string) => email.trim().toLowerCase();

/** Lower-cased, de-duplicated. Empty when ALLOWED_EMAILS is not set: then nobody can sign in. */
export function allowedEmails(): string[] {
  const list = (process.env.ALLOWED_EMAILS ?? "").split(",").map(normalize).filter(Boolean);
  return Array.from(new Set(list));
}

export function isAllowedEmail(email: unknown): boolean {
  return typeof email === "string" && allowedEmails().includes(normalize(email));
}

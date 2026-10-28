import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/app/auth/login-form";
import { allowedEmails } from "@/lib/auth/allowlist";
import { getSession, isFirstRun } from "@/lib/auth/server";
import { getT } from "@/lib/i18n/server";

export function generateMetadata(): Metadata {
  const { t } = getT();
  return { title: `${t.auth.signInTitle} · EdgeXI` };
}

/** Where to go after signing in: a path on this site only, so ?next= cannot send people elsewhere. */
function safeNext(next: string | string[] | undefined) {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.startsWith("/login")) return "/";
  return next;
}

export default async function LoginPage({ searchParams }: { searchParams: { next?: string | string[] } }) {
  const next = safeNext(searchParams.next);
  if (await getSession()) redirect(next);
  return <LoginForm next={next} firstRun={await isFirstRun()} noAllowedEmails={allowedEmails().length === 0} />;
}

import Link from "next/link";
import { getT } from "@/lib/i18n/server";

/** Unknown URLs (only reached when signed in: the middleware sends everyone else to /login). A missing match uses (app)/not-found.tsx. */
export default function RootNotFound() {
  const { t } = getT();
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-start justify-center gap-3 px-4">
      <h1 className="text-2xl font-semibold">{t.notFound.pageTitle}</h1>
      <p className="text-sm text-muted-foreground">{t.notFound.pageBody}</p>
      <Link href="/" className="text-sm underline">{t.notFound.home}</Link>
    </div>
  );
}

import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export default function NotFound() {
  const { t } = getT();
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold">{t.notFound.title}</h1>
      <p className="text-sm text-muted-foreground">{t.notFound.body}</p>
      <Link href="/matches" className="text-sm underline">{t.notFound.back}</Link>
    </div>
  );
}

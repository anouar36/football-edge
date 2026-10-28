import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { PAGE_SIZE } from "@/lib/data";
import { cn, ltr } from "@/lib/utils";

/** Page number from ?page= (1 when missing or invalid). */
export const pageOf = (v: string | string[] | undefined) => Math.max(1, Math.min(10_000, Number.parseInt(typeof v === "string" ? v : "1", 10) || 1));

/** Newer / Older links for a list split into PAGE_SIZE rows. `href(n)` builds the URL of page n. */
export function Pager({ page, total, href }: { page: number; total: number; href: (page: number) => string }) {
  const { t } = getT();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  const link = (n: number, label: React.ReactNode, enabled: boolean) => (
    <Link
      href={href(n)}
      aria-disabled={!enabled}
      tabIndex={enabled ? undefined : -1}
      className={cn("flex items-center gap-1 rounded-md px-3 py-1.5 text-sm hover:bg-secondary", !enabled && "pointer-events-none opacity-40")}
    >
      {label}
    </Link>
  );
  return (
    <nav className="flex items-center justify-between gap-3 px-3 pt-3 sm:px-0">
      {link(page - 1, <><ChevronLeft className="h-4 w-4 rtl:-scale-x-100" />{t.paging.prev}</>, page > 1)}
      <span className="text-xs text-muted-foreground">{t.paging.page(ltr(page), ltr(pages))}</span>
      {link(page + 1, <>{t.paging.next}<ChevronRight className="h-4 w-4 rtl:-scale-x-100" /></>, page < pages)}
    </nav>
  );
}

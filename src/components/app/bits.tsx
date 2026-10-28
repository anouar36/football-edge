import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Num } from "@/components/app/num";
import { getT } from "@/lib/i18n/server";
import { cn, pct } from "@/lib/utils";

/* Server components: they read the interface language from the cookie. */

export function PageHeader({ title, back, right, sub }: { title: string; back?: string; right?: React.ReactNode; sub?: React.ReactNode }) {
  const { t } = getT();
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {back && (
          <Link href={back} className="rounded-md p-1 hover:bg-secondary" aria-label={t.common.back}>
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
          </Link>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function KV({ k, v, className }: { k: React.ReactNode; v: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-[7px] text-sm", className)}>
      <span className="text-muted-foreground">{k}</span>
      <span className="num text-end">{v}</span>
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label-xs">{label}</span>
      <span className={cn("text-xl font-semibold", tone === "good" && "text-success", tone === "bad" && "text-destructive")}>
        <Num>{value}</Num>
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function VerdictBadge({ verdict }: { verdict?: string | null }) {
  const { t } = getT();
  if (!verdict) return <Badge variant="secondary">{t.verdict.none}</Badge>;
  const v = { KEEP: "success", CAUTION: "warning", AVOID: "destructive" } as const;
  const known = verdict in v ? (verdict as keyof typeof v) : null;
  return <Badge variant={known ? v[known] : "secondary"}>{known ? t.verdict[known] : verdict}</Badge>;
}

export function ResultBadge({ result, status }: { result: string; status?: string }) {
  const { t } = getT();
  if (status === "SKIPPED" && result === "PENDING") return <Badge variant="secondary">{t.result.skipped}</Badge>;
  if (result === "WON") return <Badge variant="solidSuccess">{t.result.won}</Badge>;
  if (result === "LOST") return <Badge variant="destructive">{t.result.lost}</Badge>;
  if (result === "VOID") return <Badge variant="secondary">{t.result.void}</Badge>;
  return <Badge variant={status === "PLACED" ? "default" : "outline"}>{status === "PLACED" ? t.result.placed : t.result.open}</Badge>;
}

/** Fills from the start side: left in English, right in Arabic. */
export function ProbBar({ p, market, className }: { p: number; market?: number; className?: string }) {
  const { t } = getT();
  return (
    <div className={cn("relative h-1.5 w-full rounded-full bg-secondary", className)}>
      <div className="absolute inset-y-0 start-0 rounded-full bg-foreground" style={{ width: `${Math.min(100, p * 100)}%` }} />
      {market != null && (
        <div
          className="absolute -top-1 h-3.5 w-0.5 rounded bg-warning"
          style={{ insetInlineStart: `${Math.min(100, market * 100)}%` }}
          title={t.common.marketTick(pct(market))}
        />
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card/50 px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function TeamMark({ name, className }: { name: string; className?: string }) {
  const initials = name
    .replace(/[^A-Za-z' ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  // deterministic hue per team
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <div
      className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white", className)}
      style={{ background: `hsl(${h} 45% 38%)` }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

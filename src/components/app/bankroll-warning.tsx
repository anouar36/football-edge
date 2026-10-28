import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { bankrollIssues, maxStake, MIN_BET } from "@/lib/bankroll";
import { cn, ltr, money, pct } from "@/lib/utils";

/**
 * Says when the bankroll cannot support the stakes: 0, too small for a real bet, or open stakes sized
 * for an earlier, larger bankroll (the "share of bankroll 100%" case). Renders nothing otherwise.
 */
export function BankrollWarning({
  settings,
  stakes,
  showLink = true,
  className,
}: {
  settings: { bankroll: number; maxStakePct: number; currency: string };
  stakes?: number[];
  showLink?: boolean;
  className?: string;
}) {
  const { t } = getT();
  const issues = bankrollIssues(settings, stakes);
  const cur = settings.currency;
  const lines = [
    issues.notPositive && t.bankroll.notPositive,
    issues.tooSmall &&
      t.bankroll.tooSmall(ltr(money(settings.bankroll, cur)), ltr(pct(settings.maxStakePct, 1)), ltr(money(maxStake(settings), cur)), ltr(money(MIN_BET, cur))),
    issues.overStaked != null && t.bankroll.overStaked(ltr(pct(issues.overStaked, 0))),
  ].filter((l): l is string => Boolean(l));
  if (!lines.length) return null;
  return (
    <div role="alert" className={cn("flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm leading-6", className)}>
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="flex flex-col gap-1">
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
        {showLink && (
          <Link href="/settings" className="self-start font-medium underline underline-offset-2">
            {t.bankroll.openSettings}
          </Link>
        )}
      </div>
    </div>
  );
}

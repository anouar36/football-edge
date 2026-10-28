"use client";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Num } from "@/components/app/num";
import { useT } from "@/lib/i18n/client";
import { cn, ltr, pct } from "@/lib/utils";

/** Enter your own bookmaker's odds for any market and see if it is a value bet. Labels arrive translated. */
export function ValueCalculator({
  options,
  bankroll,
  kellyFraction,
  maxStakePct,
  currency,
}: {
  options: { key: string; label: string; p: number }[];
  bankroll: number;
  kellyFraction: number;
  maxStakePct: number;
  currency: string;
}) {
  const { t } = useT();
  const [key, setKey] = useState(options[0]?.key ?? "");
  const [odds, setOdds] = useState("");
  const opt = options.find((o) => o.key === key);
  const o = Number(odds);
  const r = useMemo(() => {
    if (!opt || !(o > 1)) return null;
    const edge = opt.p * o - 1;
    const kelly = Math.max(0, edge / (o - 1));
    const stakePct = Math.min(maxStakePct, kelly * kellyFraction);
    return { edge, stakePct, stake: bankroll * stakePct, fair: 1 / opt.p };
  }, [opt, o, bankroll, kellyFraction, maxStakePct]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="calc-market" className="label-xs">{t.calc.market}</Label>
          <select
            id="calc-market"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="h-9 w-full min-w-0 rounded-md border border-input bg-card px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {options.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label} · {ltr(pct(x.p))}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="calc-odds" className="label-xs">{t.calc.yourOdds}</Label>
          <Input id="calc-odds" dir="ltr" inputMode="decimal" placeholder={t.calc.placeholder} value={odds} onChange={(e) => setOdds(e.target.value.replace(",", "."))} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 rounded-lg bg-secondary p-3 text-sm">
        <div>
          <div className="label-xs">{t.calc.fairOdds}</div>
          <Num className="mt-1 block font-semibold">{opt ? (1 / opt.p).toFixed(2) : "—"}</Num>
        </div>
        <div>
          <div className="label-xs">{t.calc.edge}</div>
          <Num className={cn("mt-1 block font-semibold", r && (r.edge > 0 ? "text-success" : "text-destructive"))}>{r ? pct(r.edge) : "—"}</Num>
        </div>
        <div>
          <div className="label-xs">{t.calc.stake}</div>
          <Num className="mt-1 block font-semibold">{r ? `${r.stake.toFixed(2)} ${currency}` : "—"}</Num>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t.calc.note}</p>
    </div>
  );
}

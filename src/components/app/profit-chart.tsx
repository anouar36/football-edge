"use client";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useT } from "@/lib/i18n/client";

/** Stays left-to-right in Arabic too: the x axis is the bet number. */
export function ProfitChart({ data, currency }: { data: { i: number; date: string; profit: number }[]; currency: string }) {
  const { t } = useT();
  const last = data[data.length - 1]?.profit ?? 0;
  const color = last >= 0 ? "hsl(152 52% 42%)" : "hsl(356 70% 50%)";
  return (
    <div dir="ltr" className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pf" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="i" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
          <YAxis tickLine={false} axisLine={false} fontSize={11} width={48} stroke="hsl(var(--muted-foreground))" />
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12 }}
            formatter={(v) => [`${Number(v).toFixed(2)} ${currency}`, t.history.chartProfit]}
            labelFormatter={(i, p) => t.history.chartBet(String(i), p?.[0]?.payload?.date ?? "")}
          />
          <Area type="monotone" dataKey="profit" stroke={color} strokeWidth={2} fill="url(#pf)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

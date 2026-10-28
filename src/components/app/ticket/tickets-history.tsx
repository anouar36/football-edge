import { ticketsOverview } from "@/lib/data";
import { marketLabel } from "@/lib/model/markets";
import { getT } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, Stat } from "@/components/app/bits";
import { Num } from "@/components/app/num";
import { Pager } from "@/components/app/pager";
import { cn, fmtDate, ltr, money, pct } from "@/lib/utils";

const RESULT_VARIANT = { WON: "solidSuccess", LOST: "destructive", VOID: "secondary", PENDING: "outline" } as const;

/** Performance → Tickets: the same totals as the picks (count, hit rate, profit, ROI) and the saved tickets. */
export async function TicketsHistory({ page, currency }: { page: number; currency: string }) {
  const { t, locale } = getT();
  const h = t.tickets.history;
  const { stats: s, rows, total } = await ticketsOverview(page);
  const label = (status: string) => (status === "WON" ? t.result.won : status === "LOST" ? t.result.lost : status === "VOID" ? t.result.void : t.result.open);
  return (
    <>
      <Card>
        <CardContent className="grid grid-cols-2 gap-6 p-5 md:grid-cols-4">
          <Stat label={h.count} value={s.n} hint={s.open ? h.open(ltr(s.open)) : undefined} />
          <Stat label={h.hitRate} value={pct(s.hitRate)} hint={`${h.won}: ${s.wins} · ${h.expected(ltr(s.expectedWins.toFixed(1)))}`} />
          <Stat label={h.profit} value={money(s.profit, currency)} tone={s.n ? (s.profit >= 0 ? "good" : "bad") : undefined} />
          <Stat label={h.roi} value={pct(s.roi)} tone={s.n ? (s.roi >= 0 ? "good" : "bad") : undefined} hint={h.onStake(ltr(money(s.staked, currency)))} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{h.list}</CardTitle></CardHeader>
        <CardContent className="p-2 sm:p-5 sm:pt-0">
          {rows.length === 0 ? (
            <Empty title={h.empty}>{h.emptyHint}</Empty>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{h.saved}</TableHead>
                    <TableHead>{h.legs}</TableHead>
                    <TableHead className="text-end">{h.odds}</TableHead>
                    <TableHead className="text-end">{h.prob}</TableHead>
                    <TableHead className="text-end">{h.ev}</TableHead>
                    <TableHead className="text-end">{h.stake}</TableHead>
                    <TableHead className="text-end">{h.profitCol}</TableHead>
                    <TableHead>{h.status}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((tk) => (
                    <TableRow key={tk.id}>
                      <TableCell className="whitespace-nowrap align-top text-muted-foreground">{fmtDate(tk.createdAt, locale)}</TableCell>
                      <TableCell className="align-top">
                        <ul className="flex flex-col gap-1">
                          {tk.legs.map((l) => (
                            <li key={`${l.matchId}|${l.key}`} className="flex flex-wrap items-center gap-x-2 text-xs">
                              <span className="font-medium">{marketLabel(l.key, l.home, l.away, locale)}</span>
                              <span className="text-muted-foreground">
                                {l.home} {l.homeGoals != null ? <Num>{`${l.homeGoals}–${l.awayGoals}`}</Num> : "–"} {l.away} · <Num>{l.odds.toFixed(2)}</Num>
                              </span>
                              {l.result !== "PENDING" && <Badge variant={RESULT_VARIANT[l.result as keyof typeof RESULT_VARIANT] ?? "secondary"}>{label(l.result)}</Badge>}
                            </li>
                          ))}
                        </ul>
                      </TableCell>
                      <TableCell className="text-end align-top"><Num>{tk.totalOdds.toFixed(2)}</Num></TableCell>
                      <TableCell className="text-end align-top"><Num>{pct(tk.prob)}</Num></TableCell>
                      <TableCell className={cn("text-end align-top", tk.ev >= 0 ? "text-success" : "text-destructive")}><Num>{pct(tk.ev)}</Num></TableCell>
                      <TableCell className="text-end align-top"><Num>{tk.stake.toFixed(2)}</Num></TableCell>
                      <TableCell className={cn("text-end align-top font-medium", (tk.profit ?? 0) >= 0 ? "text-success" : "text-destructive")}>
                        <Num>{tk.profit != null ? tk.profit.toFixed(2) : "—"}</Num>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={RESULT_VARIANT[tk.status as keyof typeof RESULT_VARIANT] ?? "secondary"}>{label(tk.status)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pager page={page} total={total} href={(n) => `/history?view=tickets${n > 1 ? `&page=${n}` : ""}`} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

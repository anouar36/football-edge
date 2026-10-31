import { Suspense } from "react";
import Link from "next/link";
import { cachedSettings, pickStats, profitCurve, settledPicks, type HistoryView } from "@/lib/data";
import { loadLogos } from "@/lib/queries";
import { leagueName } from "@/lib/data/leagues";
import { marketLabel } from "@/lib/model/markets";
import { getT } from "@/lib/i18n/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, PageHeader, ResultBadge, Stat } from "@/components/app/bits";
import { Num } from "@/components/app/num";
import { Pager, pageOf } from "@/components/app/pager";
import { ProfitChart } from "@/components/app/profit-chart-lazy";
import { ChartSkeleton, TableSkeleton } from "@/components/app/skeletons";
import { LeagueLogo, TeamPair } from "@/components/app/logos";
import { TicketsHistory } from "@/components/app/ticket/tickets-history";
import { cn, fmtDate, ltr, money, pct } from "@/lib/utils";

/** The chart's points come from their own query and recharts is a separate download: streamed after the totals. */
async function Curve({ view, currency }: { view: HistoryView; currency: string }) {
  const { t } = getT();
  const [curve, s] = await Promise.all([profitCurve(view), pickStats(view)]);
  return (
    <>
      {curve.length < 2 ? <Empty title={t.history.notEnoughTitle}>{t.history.notEnoughBody}</Empty> : <ProfitChart data={curve} currency={currency} />}
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        {t.history.note}
        {s.brier != null && t.history.brier(ltr(s.brier.toFixed(3)))}
      </p>
    </>
  );
}

async function SettledTable({ view, page }: { view: HistoryView; page: number }) {
  const { t, locale } = getT();
  const [{ rows: picks, total }, logos] = await Promise.all([settledPicks(view, page), loadLogos()]);
  if (picks.length === 0) return <Empty title={t.history.noSettledTitle}>{t.history.noSettledBody}</Empty>;
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.table.date}</TableHead>
            <TableHead>{t.table.match}</TableHead>
            <TableHead>{t.table.bet}</TableHead>
            <TableHead className="text-end">{t.table.odds}</TableHead>
            <TableHead className="text-end">{t.table.prob}</TableHead>
            <TableHead className="text-end">{t.table.closing}</TableHead>
            <TableHead className="text-end">{t.table.clv}</TableHead>
            <TableHead className="text-end">{t.table.stake}</TableHead>
            <TableHead className="text-end">{t.table.profit}</TableHead>
            <TableHead>{t.table.result}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {picks.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(p.match.kickoff, locale)}</TableCell>
              <TableCell>
                <Link className="flex items-center gap-3" href={`/matches/${encodeURIComponent(p.matchId)}`}>
                  <TeamPair match={p.match} logos={logos} />
                  <div className="min-w-0">
                    <div className="hover:underline">
                      {p.match.home} <Num>{p.match.homeGoals}:{p.match.awayGoals}</Num> {p.match.away}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <LeagueLogo code={p.match.league} name={leagueName(p.match.league, locale)} src={logos.league(p.match.league)} size={14} />
                      <span>{leagueName(p.match.league, locale)}</span>
                    </div>
                  </div>
                </Link>
              </TableCell>
              <TableCell>{marketLabel(p.key, p.match.home, p.match.away, locale)}</TableCell>
              <TableCell className="text-end"><Num>{p.odds.toFixed(2)}</Num></TableCell>
              <TableCell className="text-end"><Num>{pct(p.prob, 0)}</Num></TableCell>
              <TableCell className="text-end"><Num>{p.closingOdds?.toFixed(2) ?? "-"}</Num></TableCell>
              <TableCell className={cn("text-end", p.clv != null && (p.clv >= 0 ? "text-success" : "text-destructive"))}><Num>{p.clv != null ? pct(p.clv) : "-"}</Num></TableCell>
              <TableCell className="text-end"><Num>{p.stake.toFixed(2)}</Num></TableCell>
              <TableCell className={cn("text-end font-medium", (p.profit ?? 0) >= 0 ? "text-success" : "text-destructive")}><Num>{(p.profit ?? 0).toFixed(2)}</Num></TableCell>
              <TableCell><ResultBadge result={p.result} status={p.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pager page={page} total={total} href={(n) => `/history${view === "placed" ? "?view=placed" : ""}${n > 1 ? `${view === "placed" ? "&" : "?"}page=${n}` : ""}`} />
    </>
  );
}

export default async function HistoryPage({ searchParams }: { searchParams: { view?: string; page?: string } }) {
  const { t } = getT();
  const view = searchParams.view === "placed" ? "placed" : searchParams.view === "tickets" ? "tickets" : "all";
  const page = pageOf(searchParams.page);
  const settings = await cachedSettings();
  const cur = settings.currency;
  const tab = (v: typeof view, href: string, label: string) => (
    <Link href={href} className={cn("rounded-md px-3 py-1", view === v ? "bg-card shadow" : "text-muted-foreground")}>{label}</Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.history.title}
        sub={view === "all" ? t.history.subAll : view === "placed" ? t.history.subPlaced : t.tickets.history.sub}
        right={
          <div className="flex gap-1 rounded-lg bg-secondary p-1 text-sm">
            {tab("all", "/history", t.history.tabAll)}
            {tab("placed", "/history?view=placed", t.history.tabPlaced)}
            {tab("tickets", "/history?view=tickets", t.tickets.history.tab)}
          </div>
        }
      />
      {view === "tickets" ? (
        <TicketsHistory page={page} currency={cur} />
      ) : (
        <>
          <PickTotals view={view} currency={cur} />
          <Card>
            <CardHeader><CardTitle>{t.history.cumulative}</CardTitle></CardHeader>
            <CardContent>
              <Suspense fallback={<ChartSkeleton />}>
                <Curve view={view} currency={cur} />
              </Suspense>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t.history.settledBets}</CardTitle></CardHeader>
            <CardContent className="p-2 sm:p-5 sm:pt-0">
              <Suspense fallback={<TableSkeleton rows={8} cols={7} />}>
                <SettledTable view={view} page={page} />
              </Suspense>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

async function PickTotals({ view, currency }: { view: HistoryView; currency: string }) {
  const { t } = getT();
  const s = await pickStats(view);
  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-6 p-5 md:grid-cols-3 xl:grid-cols-6">
        <Stat label={t.history.settledBets} value={s.n} />
        <Stat label={t.history.won} value={`${s.wins}`} hint={t.history.expected(ltr(s.expectedWins.toFixed(1)))} />
        <Stat label={t.history.hitRate} value={pct(s.hitRate)} />
        <Stat label={t.history.profit} value={money(s.profit, currency)} tone={s.n ? (s.profit >= 0 ? "good" : "bad") : undefined} />
        <Stat label={t.history.roi} value={pct(s.roi)} tone={s.n ? (s.roi >= 0 ? "good" : "bad") : undefined} hint={t.history.onStaked(ltr(money(s.staked, currency)))} />
        <Stat label={t.history.avgClv} value={s.avgClv != null ? pct(s.avgClv) : "—"} tone={s.avgClv != null ? (s.avgClv >= 0 ? "good" : "bad") : undefined} hint={t.history.beatClosing} />
      </CardContent>
    </Card>
  );
}

import Link from "next/link";
import { cachedSettings, finishedMatches, upcomingMatches, type MatchRow } from "@/lib/data";
import { loadLogos } from "@/lib/queries";
import { leagueName } from "@/lib/data/leagues";
import { marketLabel } from "@/lib/model/markets";
import { legFromLite } from "@/lib/ticket-legs";
import { getT } from "@/lib/i18n/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, PageHeader } from "@/components/app/bits";
import { LeagueLogo, TeamPair } from "@/components/app/logos";
import { Num } from "@/components/app/num";
import { Pager, pageOf } from "@/components/app/pager";
import { AddToTicket } from "@/components/app/ticket/add-to-ticket";
import { fmtDate, fmtTime, pct } from "@/lib/utils";

/** A probability cell; upcoming matches get an add-to-ticket toggle around it. */
function ProbCell({ m, k, past, modelWeight }: { m: MatchRow; k: string; past: boolean; modelWeight: number }) {
  const shown = <Num>{pct(m.probs[k], 0)}</Num>;
  const blend = m.pick?.key === k ? m.pick.prob : undefined;
  const leg = past ? null : legFromLite(m, k, m.probs[k], modelWeight, { blend, pick: m.pick });
  return <TableCell className="text-end">{leg ? <AddToTicket leg={leg} variant="inline">{shown}</AddToTicket> : shown}</TableCell>;
}

export default async function MatchesPage({ searchParams }: { searchParams: { past?: string; page?: string } }) {
  const { t, locale } = getT();
  const past = searchParams.past === "1";
  const page = pageOf(searchParams.page);
  const [list, logos, settings] = await Promise.all([
    past ? finishedMatches(page) : upcomingMatches().then((rows) => ({ rows, total: rows.length })),
    loadLogos(),
    cachedSettings(),
  ]);
  const matches = list.rows;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.matches.title}
        sub={t.matches.sub}
        right={
          <div className="flex gap-1 rounded-lg bg-secondary p-1 text-sm">
            <Link href="/matches" className={`rounded-md px-3 py-1 ${!past ? "bg-card shadow" : "text-muted-foreground"}`}>{t.matches.upcoming}</Link>
            <Link href="/matches?past=1" className={`rounded-md px-3 py-1 ${past ? "bg-card shadow" : "text-muted-foreground"}`}>{t.matches.finished}</Link>
          </div>
        }
      />
      <Card>
        <CardContent className="p-2 sm:p-5">
          {matches.length === 0 ? (
            <Empty title={t.matches.emptyTitle}>{t.matches.emptyBody}</Empty>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.table.match}</TableHead>
                    <TableHead>{t.table.kickoff}</TableHead>
                    <TableHead className="text-end">{t.table.home}</TableHead>
                    <TableHead className="text-end">{t.table.draw}</TableHead>
                    <TableHead className="text-end">{t.table.away}</TableHead>
                    <TableHead className="text-end">{t.table.xg}</TableHead>
                    <TableHead className="whitespace-nowrap text-end">{t.table.over25}</TableHead>
                    <TableHead className="whitespace-nowrap text-end">{t.table.btts}</TableHead>
                    <TableHead>{past ? t.table.score : t.table.pick}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.map((m) => {
                    const pickLeg = !past && m.pick ? legFromLite(m, m.pick.key, m.pick.modelProb, settings.modelWeight, { blend: m.pick.prob, odds: m.pick.odds, pick: m.pick }) : null;
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <Link href={`/matches/${encodeURIComponent(m.id)}`} className="flex items-center gap-3">
                            <TeamPair match={m} logos={logos} />
                            <div className="min-w-0">
                              <div className="truncate font-medium hover:underline">{m.home} – {m.away}</div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <LeagueLogo code={m.league} name={leagueName(m.league, locale)} src={logos.league(m.league)} size={14} />
                                <span>{leagueName(m.league, locale)}</span>
                              </div>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(m.kickoff, locale)} <Num>{fmtTime(m.kickoff)}</Num></TableCell>
                        <ProbCell m={m} k="1X2:HOME" past={past} modelWeight={settings.modelWeight} />
                        <ProbCell m={m} k="1X2:DRAW" past={past} modelWeight={settings.modelWeight} />
                        <ProbCell m={m} k="1X2:AWAY" past={past} modelWeight={settings.modelWeight} />
                        <TableCell className="whitespace-nowrap text-end"><Num>{m.xgHome != null && m.xgAway != null ? `${m.xgHome.toFixed(1)}–${m.xgAway.toFixed(1)}` : "—"}</Num></TableCell>
                        <ProbCell m={m} k="OU2.5:OVER" past={past} modelWeight={settings.modelWeight} />
                        <ProbCell m={m} k="BTTS:YES" past={past} modelWeight={settings.modelWeight} />
                        <TableCell>
                          {past ? (
                            <Num className="font-medium">{m.homeGoals}–{m.awayGoals}</Num>
                          ) : m.pick ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Badge variant="success">{marketLabel(m.pick.key, m.home, m.away, locale)}</Badge>
                              {pickLeg && <AddToTicket leg={pickLeg} />}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t.matches.noValue}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {past && <Pager page={page} total={list.total} href={(n) => `/matches?past=1${n > 1 ? `&page=${n}` : ""}`} />}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

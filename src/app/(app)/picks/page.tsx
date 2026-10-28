import Link from "next/link";
import { cachedSettings, upcomingPicksLite } from "@/lib/data";
import { loadLogos } from "@/lib/queries";
import { leagueName } from "@/lib/data/leagues";
import { marketLabel } from "@/lib/model/markets";
import { activeProvider } from "@/lib/llm";
import { aboveMax, maxStake } from "@/lib/bankroll";
import { legFromPick } from "@/lib/ticket-legs";
import { getT } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, PageHeader, ProbBar, VerdictBadge } from "@/components/app/bits";
import { BankrollWarning } from "@/components/app/bankroll-warning";
import { LeagueLogo, TeamPair } from "@/components/app/logos";
import { Num } from "@/components/app/num";
import { PickActions } from "@/components/app/pick-actions";
import { AddToTicket } from "@/components/app/ticket/add-to-ticket";
import { fmtDay, fmtTime, ltr, money, pct } from "@/lib/utils";

export default async function PicksPage() {
  const { t, locale } = getT();
  const [picks, settings, logos] = await Promise.all([upcomingPicksLite(), cachedSettings(), loadLogos()]);
  const ai = activeProvider(settings);
  const days = new Map<string, typeof picks>();
  for (const p of picks) {
    const d = fmtDay(p.match.kickoff, locale);
    days.set(d, [...(days.get(d) ?? []), p]);
  }
  const open = picks.filter((p) => p.status !== "SKIPPED" && p.stake > 0);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.picks.title}
        sub={t.picks.sub(ltr(pct(settings.minEdge, 0)), ltr(pct(settings.minProb, 0)), ltr(settings.minOdds), ltr(settings.maxOdds))}
      />
      <BankrollWarning settings={settings} stakes={open.map((p) => p.stake)} />
      {picks.length === 0 && <Empty title={t.picks.emptyTitle}>{t.picks.emptyBody}</Empty>}
      {Array.from(days.entries()).map(([day, list]) => (
        <Card key={day}>
          <CardContent className="p-2 sm:p-5">
            <div className="label-xs px-3 pb-2 pt-3 sm:px-0 sm:pt-0">{day}</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.table.match}</TableHead>
                  <TableHead>{t.table.bet}</TableHead>
                  <TableHead className="w-44">{t.table.winProbability}</TableHead>
                  <TableHead className="text-end">{t.table.odds}</TableHead>
                  <TableHead className="text-end">{t.table.edge}</TableHead>
                  <TableHead className="text-end">{t.table.stake}</TableHead>
                  <TableHead>{ai.name}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => {
                  const leg = legFromPick(p, settings.modelWeight);
                  return (
                    <TableRow key={p.id} className={p.status === "SKIPPED" ? "opacity-50" : ""}>
                      <TableCell>
                        <Link href={`/matches/${encodeURIComponent(p.matchId)}`} className="flex items-center gap-3">
                          <TeamPair match={p.match} logos={logos} />
                          <div className="min-w-0">
                            <div className="truncate font-medium hover:underline">{p.match.home} – {p.match.away}</div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span>
                                <Num>{fmtTime(p.match.kickoff)}</Num> {t.common.utc} ·
                              </span>
                              <LeagueLogo code={p.match.league} name={leagueName(p.match.league, locale)} src={logos.league(p.match.league)} size={14} />
                              <span>{leagueName(p.match.league, locale)}</span>
                            </div>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-2">
                          {marketLabel(p.key, p.match.home, p.match.away, locale)}
                          {leg && <AddToTicket leg={leg} />}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Num className="w-11 shrink-0">{pct(p.prob)}</Num>
                          <ProbBar p={p.prob} market={p.marketProb} />
                        </div>
                      </TableCell>
                      <TableCell className="text-end"><Num>{p.odds.toFixed(2)}</Num></TableCell>
                      <TableCell className="text-end text-success"><Num>+{pct(p.edge)}</Num></TableCell>
                      <TableCell className="text-end font-medium">
                        <Num>{p.stake.toFixed(2)}</Num>
                        {aboveMax(p.stake, settings) && (
                          <Badge variant="warning" className="ms-1.5" title={t.bankroll.aboveMaxHint(ltr(money(maxStake(settings), settings.currency)))}>
                            {t.bankroll.aboveMax}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell><VerdictBadge verdict={p.verdict} /></TableCell>
                      <TableCell><PickActions id={p.id} status={p.status} compact /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
      <p className="text-xs text-muted-foreground">{t.picks.footnote(settings.currency)}</p>
    </div>
  );
}

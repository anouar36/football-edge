import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { cachedSettings, pickStats, runsOverview, upcomingPicksLite } from "@/lib/data";
import { loadLogos } from "@/lib/queries";
import { leagueName } from "@/lib/data/leagues";
import { marketLabel } from "@/lib/model/markets";
import { activeProvider } from "@/lib/llm";
import { getT } from "@/lib/i18n/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty, PageHeader, ProbBar, Stat, VerdictBadge } from "@/components/app/bits";
import { BankrollWarning } from "@/components/app/bankroll-warning";
import { LeagueLogo, TeamPair } from "@/components/app/logos";
import { Num } from "@/components/app/num";
import { RunButton } from "@/components/app/run-button";
import { CardSkeleton } from "@/components/app/skeletons";
import { fmtDate, fmtTime, ltr, money, pct } from "@/lib/utils";

async function LastAnalysis() {
  const { t, locale } = getT();
  const { lastDaily } = await runsOverview();
  return <>{lastDaily ? t.dashboard.lastAnalysis(fmtDate(lastDaily.startedAt, locale), ltr(fmtTime(lastDaily.startedAt))) : t.dashboard.noAnalysis}</>;
}

/** The AI briefing and the recent runs: streamed after the stats and picks. */
async function RunsColumn() {
  const { t, locale } = getT();
  const [{ lastDaily, recent }, settings] = await Promise.all([runsOverview(), cachedSettings()]);
  const ai = activeProvider(settings);
  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <CardTitle>{t.dashboard.briefing(ai.name)}</CardTitle>
        </CardHeader>
        <CardContent>
          {lastDaily?.summary ? (
            <p dir="auto" className="whitespace-pre-line text-sm leading-7 text-foreground/85">{lastDaily.summary}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t.dashboard.briefingEmpty(ai.name, ai.keyEnv)}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t.dashboard.recentRuns}</CardTitle></CardHeader>
        <CardContent className="flex flex-col divide-y">
          {recent.length === 0 && <p className="text-sm text-muted-foreground">{t.dashboard.noRuns}</p>}
          {recent.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <div className="font-medium">{r.kind === "DAILY" ? t.runs.daily : t.runs.settle}</div>
                <div className="text-xs text-muted-foreground">{fmtDate(r.startedAt, locale)} <Num>{fmtTime(r.startedAt)}</Num></div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {r.kind === "DAILY" ? t.runs.dailyCounts(ltr(r.matchesAnalysed), ltr(r.picksCount)) : t.runs.settled(ltr(r.settledCount))}
                </span>
                <Badge variant={r.error ? "destructive" : r.finishedAt ? "success" : "warning"}>
                  {r.error ? t.runs.failed : r.finishedAt ? t.runs.ok : t.runs.running}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

export default async function Dashboard() {
  const { t, locale } = getT();
  // One parallel wave, usually all from the data cache.
  const [settings, picks, placed, logos] = await Promise.all([cachedSettings(), upcomingPicksLite(), pickStats("placed"), loadLogos()]);
  const ai = activeProvider(settings);
  const cur = settings.currency;
  const active = picks.filter((p) => p.status !== "SKIPPED");
  const totalStake = active.reduce((s, p) => s + p.stake, 0);
  const expectedWins = active.reduce((s, p) => s + p.prob, 0);
  const expectedProfit = active.reduce((s, p) => s + p.stake * p.edge, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.dashboard.title}
        sub={
          // A <span>: PageHeader puts `sub` inside a <p>.
          <Suspense fallback={<span className="inline-block h-4 w-56 animate-pulse rounded-md bg-secondary align-middle motion-reduce:animate-none" />}>
            <LastAnalysis />
          </Suspense>
        }
        right={<RunButton ai={ai.keySet ? ai.name : null} />}
      />

      <BankrollWarning settings={settings} stakes={active.map((p) => p.stake)} />

      <Card>
        <CardContent className="grid grid-cols-2 gap-6 p-5 md:grid-cols-4">
          <Stat label={t.dashboard.bankroll} value={money(settings.bankroll, cur)} hint={t.dashboard.maxPerBet(ltr(pct(settings.maxStakePct, 0)))} />
          <Stat
            label={t.dashboard.openPicks}
            value={active.length}
            hint={t.dashboard.staked(ltr(money(totalStake, cur)), ltr(settings.bankroll > 0 ? pct(totalStake / settings.bankroll) : "—"))}
          />
          <Stat label={t.dashboard.expectedWins} value={expectedWins.toFixed(1)} hint={t.dashboard.expectedProfit(ltr(money(expectedProfit, cur)))} />
          <Stat
            label={t.dashboard.roiPlaced}
            value={placed.n ? pct(placed.roi) : "—"}
            tone={placed.n ? (placed.roi >= 0 ? "good" : "bad") : undefined}
            hint={placed.n ? t.dashboard.settledClv(ltr(placed.n), ltr(placed.avgClv != null ? pct(placed.avgClv) : "—")) : t.dashboard.noSettled}
          />
        </CardContent>
      </Card>

      {/* grid-cols-1: without an explicit track the column grows to the table's width on phones. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t.dashboard.upcoming}</CardTitle>
            <Link href="/slip" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              {t.dashboard.openSlip} <ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" />
            </Link>
          </CardHeader>
          <CardContent className="px-2 pb-2 sm:px-5 sm:pb-5">
            {picks.length === 0 ? (
              <Empty title={t.dashboard.noValueTitle}>{t.dashboard.noValueBody(ltr(pct(settings.minEdge, 0)))}</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.table.match}</TableHead>
                    <TableHead>{t.table.pick}</TableHead>
                    <TableHead className="w-40">{t.table.probability}</TableHead>
                    <TableHead className="text-end">{t.table.odds}</TableHead>
                    <TableHead className="text-end">{t.table.stake}</TableHead>
                    <TableHead>{ai.name}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {picks.slice(0, 8).map((p) => (
                    <TableRow key={p.id} className={p.status === "SKIPPED" ? "opacity-50" : ""}>
                      <TableCell>
                        <Link href={`/matches/${encodeURIComponent(p.matchId)}`} className="flex items-center gap-3">
                          <TeamPair match={p.match} logos={logos} />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{p.match.home} – {p.match.away}</div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <LeagueLogo code={p.match.league} name={leagueName(p.match.league, locale)} src={logos.league(p.match.league)} size={14} />
                              <span>
                                {leagueName(p.match.league, locale)} · {fmtDate(p.match.kickoff, locale)} <Num>{fmtTime(p.match.kickoff)}</Num>
                              </span>
                            </div>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">{marketLabel(p.key, p.match.home, p.match.away, locale)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Num className="w-11 shrink-0 text-sm">{pct(p.prob)}</Num>
                          <ProbBar p={p.prob} market={p.marketProb} />
                        </div>
                      </TableCell>
                      <TableCell className="text-end"><Num>{p.odds.toFixed(2)}</Num></TableCell>
                      <TableCell className="text-end"><Num>{p.stake.toFixed(2)}</Num></TableCell>
                      <TableCell><VerdictBadge verdict={p.verdict} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Suspense fallback={<><CardSkeleton lines={5} /><CardSkeleton lines={4} /></>}>
            <RunsColumn />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

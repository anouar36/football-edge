import { cachedSettings, upcomingPicksLite } from "@/lib/data";
import { loadLogos } from "@/lib/queries";
import { leagueName } from "@/lib/data/leagues";
import { marketLabel } from "@/lib/model/markets";
import { aboveMax, maxStake } from "@/lib/bankroll";
import { rich } from "@/lib/i18n/rich";
import { getT } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Empty, KV, PageHeader, ProbBar, VerdictBadge } from "@/components/app/bits";
import { BankrollWarning } from "@/components/app/bankroll-warning";
import { Num } from "@/components/app/num";
import { CopySlip } from "@/components/app/copy-slip";
import { LeagueLogo, TeamPair } from "@/components/app/logos";
import { fmtTime, ltr, money, pct } from "@/lib/utils";

/** Probability that at least k of n independent bets win. */
function atLeast(probs: number[], k: number) {
  let dist = [1];
  for (const p of probs) {
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((v, i) => { next[i] += v * (1 - p); next[i + 1] += v * p; });
    dist = next;
  }
  return dist.slice(k).reduce((a, b) => a + b, 0);
}

export default async function SlipPage() {
  const { t, locale } = getT();
  const [all, settings, logos] = await Promise.all([upcomingPicksLite(), cachedSettings(), loadLogos()]);
  const picks = all.filter((p) => p.status !== "SKIPPED" && p.stake > 0);
  const cur = settings.currency;
  const probs = picks.map((p) => p.prob);
  const stake = picks.reduce((s, p) => s + p.stake, 0);
  const evProfit = picks.reduce((s, p) => s + p.stake * p.edge, 0);
  const best = picks.reduce((s, p) => s + p.stake * (p.odds - 1), 0);
  const accaProb = probs.reduce((a, b) => a * b, 1);
  const accaOdds = picks.reduce((a, p) => a * p.odds, 1);
  const label = (p: (typeof picks)[number]) => marketLabel(p.key, p.match.home, p.match.away, locale);
  const text = [
    t.slip.textHeader(new Date().toISOString().slice(0, 10)),
    ...picks.map((p, i) => `${i + 1}. ${p.match.home} v ${p.match.away} (${fmtTime(p.match.kickoff)} UTC) | ${label(p)} @ ${p.odds.toFixed(2)} | ${pct(p.prob)} | ${t.slip.textStake} ${p.stake.toFixed(2)} ${cur}`),
    t.slip.textTotal(`${stake.toFixed(2)} ${cur}`, `${evProfit.toFixed(2)} ${cur}`),
  ].join("\n");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.slip.title} sub={t.slip.sub} right={picks.length ? <CopySlip text={text} /> : undefined} />
      <BankrollWarning settings={settings} stakes={picks.map((p) => p.stake)} />
      {picks.length === 0 ? (
        <Empty title={t.slip.emptyTitle}>{t.slip.emptyBody}</Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <CardContent className="flex flex-col divide-y p-0">
              {picks.map((p, i) => (
                <div key={p.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
                  <div className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-sm font-semibold">{i + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{label(p)}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                      <TeamPair match={p.match} logos={logos} size={16} />
                      <span>{p.match.home} vs {p.match.away},</span>
                      <LeagueLogo code={p.match.league} name={leagueName(p.match.league, locale)} src={logos.league(p.match.league)} size={14} />
                      <span>
                        {leagueName(p.match.league, locale)}, <Num>{fmtTime(p.match.kickoff)}</Num> {t.common.utc}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <ProbBar p={p.prob} market={p.marketProb} className="max-w-[220px]" />
                      <span className="shrink-0 text-xs">{t.slip.toWin(ltr(pct(p.prob)))}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-5 sm:justify-end">
                    <VerdictBadge verdict={p.verdict} />
                    <div className="text-end">
                      <div className="label-xs">{t.table.odds}</div>
                      <Num className="font-semibold">{p.odds.toFixed(2)}</Num>
                    </div>
                    <div className="text-end">
                      <div className="label-xs">{t.table.stake}</div>
                      <Num className="font-semibold">{p.stake.toFixed(2)}</Num>
                      {aboveMax(p.stake, settings) && (
                        <Badge variant="warning" className="mt-1 block" title={t.bankroll.aboveMaxHint(ltr(money(maxStake(settings), cur)))}>
                          {t.bankroll.aboveMax}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader><CardTitle>{t.slip.summary}</CardTitle></CardHeader>
              <CardContent className="flex flex-col">
                <KV k={t.slip.bets} v={<Num>{picks.length}</Num>} />
                <KV k={t.slip.totalStake} v={<Num>{money(stake, cur)}</Num>} />
                <KV
                  k={t.slip.shareOfBankroll}
                  v={<Num className={stake > settings.bankroll * settings.maxStakePct * picks.length + 0.01 ? "font-semibold text-warning" : undefined}>{settings.bankroll > 0 ? pct(stake / settings.bankroll) : "—"}</Num>}
                />
                <KV k={t.slip.expectedWinners} v={t.slip.xOfN(ltr(probs.reduce((a, b) => a + b, 0).toFixed(1)), ltr(picks.length))} />
                <KV k={t.slip.atLeastOne} v={<Num>{pct(atLeast(probs, 1))}</Num>} />
                <KV k={t.slip.atLeastHalf} v={<Num>{pct(atLeast(probs, Math.ceil(picks.length / 2)))}</Num>} />
                <Separator className="my-2" />
                <KV k={t.slip.expectedProfit} v={<Num className="text-success">{money(evProfit, cur)}</Num>} />
                <KV k={t.slip.allWin} v={<Num>{money(best, cur)}</Num>} />
                <KV k={t.slip.allLose} v={<Num className="text-destructive">−{money(stake, cur)}</Num>} />
              </CardContent>
            </Card>
            {picks.length > 1 && (
              <Card className="border border-warning/30">
                <CardHeader><CardTitle>{t.slip.whyNotAcca}</CardTitle></CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  {rich(t.slip.accaBody(ltr(picks.length)), {
                    odds: <Num className="font-medium text-foreground">{accaOdds.toFixed(2)}</Num>,
                    prob: <Num className="font-medium text-foreground">{pct(accaProb)}</Num>,
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

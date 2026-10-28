import { notFound } from "next/navigation";
import { CircleDot, Flag, Goal, Sparkles, Trophy } from "lucide-react";
import { cachedSettings, matchDetail } from "@/lib/data";
import { loadLogos, pred, review } from "@/lib/queries";
import { legFromLite, liteOf } from "@/lib/ticket-legs";
import { leagueCountry, leagueName } from "@/lib/data/leagues";
import { DISPLAY_KEYS, MARKET_GROUPS, marketLabel, marketName } from "@/lib/model/markets";
import { strengthScore } from "@/lib/model/predict";
import { activeProvider, reviewer } from "@/lib/llm";
import type { Dictionary } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KV, PageHeader, ProbBar, ResultBadge, VerdictBadge } from "@/components/app/bits";
import { LeagueLogo, TeamLogo } from "@/components/app/logos";
import { Num } from "@/components/app/num";
import { OddsFromImage, ValueCalculator } from "@/components/app/match-tools-lazy";
import { PickActions } from "@/components/app/pick-actions";
import { AddToTicket } from "@/components/app/ticket/add-to-ticket";
import { cn, fmtDate, fmtTime, ltr, money, pct } from "@/lib/utils";

const GROUP_ICON = [Trophy, Goal, Flag];

/** predict.ts stores these two warnings in English. */
function dataWarning(text: string, t: Dictionary) {
  if (text.startsWith("One team has no match history")) return t.match.dataWarning.unknownTeam;
  if (text.startsWith("Few recent matches")) return t.match.dataWarning.fewGames;
  return text;
}

function Stars({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex gap-0.5 text-[#2f6fb0]" aria-label={label}>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="relative inline-block h-4 w-4">
            <svg viewBox="0 0 20 20" className="absolute inset-0 h-4 w-4 fill-current opacity-20"><path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L10 15l-5.4 3 1.2-6L1.3 7.8l6.1-.7z" /></svg>
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current"><path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L10 15l-5.4 3 1.2-6L1.3 7.8l6.1-.7z" /></svg>
            </span>
          </span>
        );
      })}
    </div>
  );
}

function ScoreGrid({ scores }: { scores: { score: string; p: number }[] }) {
  const max = Math.max(...scores.map((s) => s.p));
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {scores.map((s) => (
        <div key={s.score} className="rounded-md px-2 py-2 text-center" style={{ background: `hsl(207 60% ${96 - (s.p / max) * 26}%)` }}>
          <Num className="block text-sm font-semibold text-[#14324f]">{s.score}</Num>
          <Num className="block text-[10px] text-[#14324f]/70">{pct(s.p)}</Num>
        </div>
      ))}
    </div>
  );
}

export default async function MatchPage({ params }: { params: { id: string } }) {
  const { t, locale } = getT();
  const id = decodeURIComponent(params.id);
  const [{ match, picks: matchPicks }, settings, logos] = await Promise.all([matchDetail(id), cachedSettings(), loadLogos()]);
  if (!match) notFound();
  const p = pred(match);
  const r = review(match);
  const pick = matchPicks[0];
  const odds = (match.odds ?? {}) as Record<string, number>;
  const cur = settings.currency;
  const finished = match.status === "FINISHED";
  const homeStrength = strengthScore(p?.homeRating ?? null);
  const awayStrength = strengthScore(p?.awayRating ?? null);
  const options = p
    ? DISPLAY_KEYS.filter((k) => p.probs[k] != null).map((k) => ({ key: k, label: marketLabel(k, match.home, match.away, locale), p: p.probs[k] }))
    : [];
  const ai = activeProvider(settings);
  // The analysis card names whoever wrote the stored review; without one, the active provider.
  const by = r ? reviewer(r.model) : null;
  const analystName = by?.name ?? ai.name;
  // Add-to-ticket on each market row, until kickoff. The stored pick keeps its blend and odds.
  const lite = liteOf(match);
  const canBet = !finished && match.kickoff > new Date();
  const legFor = (k: string) =>
    canBet && p
      ? legFromLite(lite, k, p.probs[k], settings.modelWeight, {
          blend: pick?.key === k ? pick.prob : p.candidates?.find((c) => c.key === k)?.prob,
          odds: pick?.key === k ? pick.odds : undefined,
          pick: pick ? { key: pick.key, verdict: pick.verdict } : null,
        })
      : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back="/matches"
        title={t.match.title}
        sub={
          <span className="inline-flex items-center gap-1.5">
            <LeagueLogo code={match.league} name={leagueName(match.league, locale)} src={logos.league(match.league)} size={18} />
            {`${leagueName(match.league, locale)} · ${leagueCountry(match.league, locale)}`}
          </span>
        }
        right={
          <Badge variant={finished ? "secondary" : "success"} className="px-3 py-1">
            {finished ? t.match.fullTime(ltr(`${match.homeGoals}–${match.awayGoals}`)) : t.match.scheduled}
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1fr)]">
        {/* Column 1: recommended bet */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="p-5">
              <div className="label-xs">{pick ? t.match.recommendedBet : t.match.modelVerdict}</div>
              <div className="mt-1 text-[34px] font-bold leading-tight tracking-tight">{pick ? <Num>{pct(pick.prob)}</Num> : t.match.noBet}</div>
              <div className="text-sm text-muted-foreground">{pick ? t.match.chanceWins : t.match.nothingBeats(ltr(pct(settings.minEdge, 0)))}</div>

              {pick && (
                <div className="mt-5 rounded-lg bg-secondary p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Num className="rounded bg-foreground px-2 py-1 text-[11px] font-bold text-background">{pick.odds.toFixed(2)}</Num>
                      <span className="text-sm font-medium">{marketLabel(pick.key, match.home, match.away, locale)}</span>
                    </div>
                    <Badge variant="solidSuccess">{t.match.value(ltr(pct(pick.edge, 0)))}</Badge>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    {t.match.explain(ltr(pct(pick.marketProb)), ltr(pct(pick.modelProb)), ltr(pct(pick.prob)))}
                  </p>
                </div>
              )}

              <div className="label-xs mt-6">{t.match.betDetails}</div>
              <div className="mt-1 flex flex-col">
                <KV k={t.match.kickoff} v={t.common.dateTime(fmtDate(match.kickoff, locale), ltr(fmtTime(match.kickoff)))} />
                {pick && (
                  <>
                    <KV k={t.match.market} v={marketName(pick.market, locale)} />
                    <KV k={t.match.oddsAverage} v={<Num>{pick.odds.toFixed(2)}</Num>} />
                    <KV k={t.match.fairOdds} v={<Num>{(1 / pick.prob).toFixed(2)}</Num>} />
                    <KV k={t.match.fullKelly} v={<Num>{pct(pick.kelly)}</Num>} />
                    <KV k={t.match.suggestedStake} v={<Num className="font-semibold">{money(pick.stake, cur)}</Num>} />
                    <KV k={t.match.review(analystName)} v={<VerdictBadge verdict={pick.verdict} />} />
                    <KV k={t.match.status} v={<ResultBadge result={pick.result} status={pick.status} />} />
                    {pick.closingOdds && <KV k={t.match.closingClv} v={<Num>{`${pick.closingOdds.toFixed(2)} · ${pct(pick.clv ?? 0)}`}</Num>} />}
                  </>
                )}
                {p && <KV k={t.match.trainingMatches} v={<Num>{p.model.trainingMatches}</Num>} />}
              </div>

              {pick && !finished && <PickActions id={pick.id} status={pick.status} className="mt-6" />}
              {p?.dataWarning && <p className="mt-4 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">{dataWarning(p.dataWarning, t)}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4 p-5">
              {[{ name: match.home, r: p?.homeRating, side: t.match.home }, { name: match.away, r: p?.awayRating, side: t.match.away }].map((team) => (
                <div key={team.side} className="flex flex-col gap-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="label-xs">{team.side}</div>
                      <div className="text-xl font-semibold leading-tight">{team.name}</div>
                    </div>
                    <TeamLogo name={team.name} src={logos.team(team.name, match.league)} size={56} />
                  </div>
                  <KV k={t.match.attack} v={team.r ? <Num>{team.r.attack.toFixed(2)}</Num> : t.match.newTeam} />
                  <KV k={t.match.defence} v={team.r ? <Num>{team.r.defence.toFixed(2)}</Num> : t.match.newTeam} />
                  <KV k={t.match.matchesInData} v={<Num>{team.r?.games ?? 0}</Num>} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Column 2: markets */}
        <Card className="self-start">
          <CardHeader><CardTitle>{t.match.marketProbs}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-5">
            {!p && <p className="text-sm text-muted-foreground">{t.match.noPrediction}</p>}
            {p &&
              MARKET_GROUPS.map((g, gi) => {
                const Icon = GROUP_ICON[gi];
                const keys = DISPLAY_KEYS.filter((k) => g.prefix.test(k) && p.probs[k] != null);
                if (!keys.length) return null;
                return (
                  <div key={g.id} className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="text-sm font-medium">{t.markets.groups[g.id]}</div>
                      {keys.map((k) => {
                        const prob = p.probs[k];
                        const o = odds[k];
                        const isPick = pick?.key === k;
                        const leg = legFor(k);
                        return (
                          <div key={k} className={cn("flex flex-col gap-1", isPick && "rounded-md bg-accent/60 px-2 py-1.5")}>
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className={cn("min-w-0", isPick ? "font-semibold" : "truncate text-foreground/80")}>{marketLabel(k, match.home, match.away, locale)}</span>
                              <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                                <span>
                                  <Num>{pct(prob)}</Num> · {t.match.fair(ltr((1 / prob).toFixed(2)))}
                                  {o ? <span className="text-foreground"> · <Num>{o.toFixed(2)}</Num></span> : null}
                                </span>
                                {leg && <AddToTicket leg={leg} />}
                              </span>
                            </div>
                            <ProbBar p={prob} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>

        {/* Column 3: floating summary card */}
        <div className="flex flex-col gap-6 lg:col-span-2 xl:col-span-1">
          <Card className="shadow-float xl:-mt-2">
            <CardContent className="p-5">
              <div className="rounded-lg border bg-[#f4f7fa] p-3 dark:bg-secondary">
                <div className="mb-2 flex items-center justify-between">
                  <span className="label-xs">{t.match.likelyScores}</span>
                  <CircleDot className="h-4 w-4 text-[#2f6fb0]" />
                </div>
                {p ? <ScoreGrid scores={p.topScores} /> : <p className="text-xs text-muted-foreground">—</p>}
              </div>
              <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-center">
                <div className="flex flex-col items-center gap-2">
                  <TeamLogo name={match.home} src={logos.team(match.home, match.league)} size={64} />
                  <span className="text-sm font-semibold leading-tight">{match.home}</span>
                </div>
                <span className="label-xs">{t.logos.vs}</span>
                <div className="flex flex-col items-center gap-2">
                  <TeamLogo name={match.away} src={logos.team(match.away, match.league)} size={64} />
                  <span className="text-sm font-semibold leading-tight">{match.away}</span>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <LeagueLogo code={match.league} name={leagueName(match.league, locale)} src={logos.league(match.league)} size={14} />
                <span>
                  {leagueName(match.league, locale)} · {fmtDate(match.kickoff, locale)}
                </span>
              </div>
              <div className="mt-4 flex flex-col">
                <KV k={t.match.expectedGoals} v={<Num>{p ? `${p.xgHome.toFixed(2)} – ${p.xgAway.toFixed(2)}` : "—"}</Num>} />
                <KV k={t.match.expectedCorners} v={<Num>{p?.xcHome != null ? `${p.xcHome.toFixed(1)} – ${p.xcAway!.toFixed(1)}` : "—"}</Num>} />
                <KV k={t.match.homeAdvantage} v={<Num>{p ? `×${p.model.homeAdv.toFixed(2)}` : "—"}</Num>} />
              </div>
              <Separator className="my-4" />
              <div className="label-xs">{t.match.strength}</div>
              <div className="mt-2 grid grid-cols-2 gap-4">
                {[{ n: match.home, s: homeStrength }, { n: match.away, s: awayStrength }].map((team) => (
                  <div key={team.n} className="flex flex-col gap-1">
                    <span className="truncate text-xs text-muted-foreground">{team.n}</span>
                    <Num className="block text-[34px] font-light leading-none">{team.s != null ? team.s.toFixed(1) : "—"}</Num>
                    {team.s != null && <Stars value={team.s} label={t.match.starsOf(team.s.toFixed(1))} />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t.match.checkOdds}</CardTitle></CardHeader>
            <CardContent>
              {options.length ? (
                <div className="flex flex-col gap-5">
                  <OddsFromImage
                    matchId={match.id}
                    options={options}
                    bankroll={settings.bankroll}
                    kellyFraction={settings.kellyFraction}
                    maxStakePct={settings.maxStakePct}
                    currency={cur}
                    canSave={canBet}
                  />
                  <Separator />
                  <ValueCalculator options={options} bankroll={settings.bankroll} kellyFraction={settings.kellyFraction} maxStakePct={settings.maxStakePct} currency={cur} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t.match.noProbs}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* AI analysis */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <CardTitle>{t.match.analysis(analystName)}</CardTitle>
          </div>
          {r && <VerdictBadge verdict={r.verdict} />}
        </CardHeader>
        <CardContent className="flex flex-col gap-6 p-0">
          {!r ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">
              {pick ? (ai.keySet ? t.match.notReviewed : t.match.notReviewedNoKey(ai.keyEnv)) : t.match.onlyPicks(ai.name)}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-6 px-5 md:grid-cols-4">
                <div><div className="label-xs">{t.match.edge}</div><Num className="mt-1 block text-xl font-semibold">{pick ? pct(pick.edge) : "—"}</Num></div>
                <div><div className="label-xs">{t.match.winProbability}</div><Num className="mt-1 block text-xl font-semibold">{pick ? pct(pick.prob) : "—"}</Num></div>
                <div><div className="label-xs">{t.match.stake}</div><Num className="mt-1 block text-xl font-semibold">{pick ? money(pick.stake, cur) : "—"}</Num></div>
                <div>
                  <div className="label-xs">{t.match.reviewedBy}</div>
                  <div className="mt-1 truncate text-sm font-medium">
                    <bdi>{by?.name ? `${by.name} · ${by.model}` : r.model}</bdi>
                  </div>
                </div>
              </div>
              <div dir="auto" className="px-5">
                <p className="font-medium">{r.headline}</p>
                <p className="mt-1 text-sm leading-7 text-foreground/80">{r.summary}</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="ps-5">{t.match.factor}</TableHead>
                    <TableHead className="pe-5 text-end">{t.match.impact}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.factors.map((f, i) => (
                    <TableRow key={i}>
                      <TableCell dir="auto" className="ps-5 text-start">{f.label}</TableCell>
                      <TableCell className="pe-5 text-end">
                        <Badge variant={f.impact === "positive" ? "success" : f.impact === "negative" ? "destructive" : "secondary"}>
                          {t.impact[f.impact] ?? f.impact}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {r.news.map((n, i) => (
                    <TableRow key={`n${i}`}>
                      <TableCell dir="auto" className="ps-5 text-start text-muted-foreground" colSpan={2}>{n}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {r.sources.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t px-5 py-4 text-xs">
                  <span className="text-muted-foreground">{t.match.sources}</span>
                  {r.sources.map((s) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noreferrer" dir="auto" className="underline underline-offset-2 hover:text-foreground">{s.title}</a>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

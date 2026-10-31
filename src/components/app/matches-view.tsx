"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Eye,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import type { MatchRow, FormOutcome } from "@/lib/data";
import type { Settings } from "@/lib/schema";
import { leagueName } from "@/lib/data/leagues";
import { marketLabel } from "@/lib/model/markets";
import { legFromLite } from "@/lib/ticket-legs";
import { useT } from "@/lib/i18n/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LeagueLogo, TeamLogo, TeamPair } from "@/components/app/logos";
import { Num } from "@/components/app/num";
import { TeamForm } from "@/components/app/team-form";
import { AddToTicket } from "@/components/app/ticket/add-to-ticket";
import { cn, fmtDate, fmtTime, pct } from "@/lib/utils";

function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card/50 px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

interface MatchesViewProps {
  matches: MatchRow[];
  logoMap: { teams: Record<string, string>; leagues: Record<string, string> };
  settings: Settings;
  teamForms: Record<string, FormOutcome[]>;
  past: boolean;
}

export function MatchesView({
  matches,
  logoMap,
  settings,
  teamForms,
  past,
}: MatchesViewProps) {
  const { t, locale } = useT();
  const [search, setSearch] = useState("");
  const [selectedLeague, setSelectedLeague] = useState<string>("ALL");
  const [selectedMatch, setSelectedMatch] = useState<MatchRow | null>(null);

  const logos = useMemo(
    () => ({
      team: (name: string, league: string) => logoMap?.teams?.[`${name}|${league}`] ?? null,
      league: (code: string) => logoMap?.leagues?.[code] ?? null,
    }),
    [logoMap]
  );

  // League options with counts
  const leagues = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of (matches ?? [])) {
      if (m?.league) counts.set(m.league, (counts.get(m.league) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [matches]);

  // Filtered matches
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (matches ?? []).filter((m) => {
      if (!m) return false;
      if (selectedLeague !== "ALL" && m.league !== selectedLeague) return false;
      if (!query) return true;
      const lName = leagueName(m.league, locale)?.toLowerCase() ?? "";
      return (
        m.home?.toLowerCase().includes(query) ||
        m.away?.toLowerCase().includes(query) ||
        m.league?.toLowerCase().includes(query) ||
        lName.includes(query)
      );
    });
  }, [matches, search, selectedLeague, locale]);

  return (
    <div className="flex flex-col gap-4">
      {/* Search and league filter pills */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              locale === "ar" ? "ابحث عن فريق أو دوري…" : "Search by team or league…"
            }
            className="ps-9 pe-8 h-9 text-xs sm:text-sm bg-card"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Quick filter pills */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            onClick={() => setSelectedLeague("ALL")}
            className={cn(
              "rounded-full px-3 py-1 font-medium transition-colors whitespace-nowrap",
              selectedLeague === "ALL"
                ? "bg-foreground text-background shadow-sm"
                : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
            )}
          >
            {locale === "ar" ? "الكل" : "All"} ({matches.length})
          </button>
          {leagues.map(([code, count]) => (
            <button
              key={code}
              type="button"
              onClick={() => setSelectedLeague(code)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors whitespace-nowrap",
                selectedLeague === code
                  ? "bg-foreground text-background shadow-sm"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
              )}
            >
              <LeagueLogo
                code={code}
                name={leagueName(code, locale)}
                src={logos.league(code)}
                size={14}
              />
              <span>{leagueName(code, locale)}</span>
              <span className="opacity-60 text-[10px]">({count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      {filtered.length === 0 ? (
        <EmptyState title={locale === "ar" ? "لا توجد نتائج" : "No matches found"}>
          {locale === "ar"
            ? "لم نجد أي مباريات تطابق معايير البحث."
            : "No matches match your search criteria."}
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setSelectedLeague("ALL");
              }}
            >
              {locale === "ar" ? "إعادة الضبط" : "Reset filters"}
            </Button>
          </div>
        </EmptyState>
      ) : (
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
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((m) => {
              const pickLeg =
                !past && m.pick
                  ? legFromLite(
                      m,
                      m.pick.key,
                      m.pick.modelProb,
                      settings.modelWeight,
                      { blend: m.pick.prob, odds: m.pick.odds, pick: m.pick }
                    )
                  : null;

              return (
                <TableRow
                  key={m.id}
                  className="group hover:bg-secondary/50 cursor-pointer transition-colors"
                  onClick={(e) => {
                    // Avoid opening sheet when clicking links or buttons directly
                    const target = e.target as HTMLElement;
                    if (target.closest("a") || target.closest("button")) return;
                    setSelectedMatch(m);
                  }}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <TeamPair match={m} logos={logos} />
                      <div className="min-w-0">
                        <Link
                          href={`/matches/${encodeURIComponent(m.id)}`}
                          className="truncate font-medium hover:underline block"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {m.home} vs {m.away}
                        </Link>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <LeagueLogo
                            code={m.league}
                            name={leagueName(m.league, locale)}
                            src={logos.league(m.league)}
                            size={14}
                          />
                          <span>{leagueName(m.league, locale)}</span>
                          {(teamForms?.[m.home] || teamForms?.[m.away]) && (
                            <span
                              className="ms-1 hidden items-center gap-1 xl:inline-flex"
                              title="Recent Form (Home vs Away)"
                            >
                              <TeamForm form={teamForms?.[m.home]} />
                              <span className="text-[10px] text-muted-foreground/60">vs</span>
                              <TeamForm form={teamForms?.[m.away]} />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {fmtDate(m.kickoff, locale)} <Num>{fmtTime(m.kickoff)}</Num>
                  </TableCell>

                  <TableCell className="text-end">
                    {(() => {
                      const shown = <Num>{pct(m.probs["1X2:HOME"], 0)}</Num>;
                      const blend = m.pick?.key === "1X2:HOME" ? m.pick.prob : undefined;
                      const leg = past
                        ? null
                        : legFromLite(m, "1X2:HOME", m.probs["1X2:HOME"], settings.modelWeight, {
                            blend,
                            pick: m.pick,
                          });
                      return leg ? (
                        <AddToTicket leg={leg} variant="inline">
                          {shown}
                        </AddToTicket>
                      ) : (
                        shown
                      );
                    })()}
                  </TableCell>

                  <TableCell className="text-end">
                    {(() => {
                      const shown = <Num>{pct(m.probs["1X2:DRAW"], 0)}</Num>;
                      const blend = m.pick?.key === "1X2:DRAW" ? m.pick.prob : undefined;
                      const leg = past
                        ? null
                        : legFromLite(m, "1X2:DRAW", m.probs["1X2:DRAW"], settings.modelWeight, {
                            blend,
                            pick: m.pick,
                          });
                      return leg ? (
                        <AddToTicket leg={leg} variant="inline">
                          {shown}
                        </AddToTicket>
                      ) : (
                        shown
                      );
                    })()}
                  </TableCell>

                  <TableCell className="text-end">
                    {(() => {
                      const shown = <Num>{pct(m.probs["1X2:AWAY"], 0)}</Num>;
                      const blend = m.pick?.key === "1X2:AWAY" ? m.pick.prob : undefined;
                      const leg = past
                        ? null
                        : legFromLite(m, "1X2:AWAY", m.probs["1X2:AWAY"], settings.modelWeight, {
                            blend,
                            pick: m.pick,
                          });
                      return leg ? (
                        <AddToTicket leg={leg} variant="inline">
                          {shown}
                        </AddToTicket>
                      ) : (
                        shown
                      );
                    })()}
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-end">
                    <Num>
                      {m.xgHome != null && m.xgAway != null
                        ? `${m.xgHome.toFixed(1)}–${m.xgAway.toFixed(1)}`
                        : "—"}
                    </Num>
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-end">
                    {(() => {
                      const shown = <Num>{pct(m.probs["OU2.5:OVER"], 0)}</Num>;
                      const blend = m.pick?.key === "OU2.5:OVER" ? m.pick.prob : undefined;
                      const leg = past
                        ? null
                        : legFromLite(m, "OU2.5:OVER", m.probs["OU2.5:OVER"], settings.modelWeight, {
                            blend,
                            pick: m.pick,
                          });
                      return leg ? (
                        <AddToTicket leg={leg} variant="inline">
                          {shown}
                        </AddToTicket>
                      ) : (
                        shown
                      );
                    })()}
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-end">
                    {(() => {
                      const shown = <Num>{pct(m.probs["BTTS:YES"], 0)}</Num>;
                      const blend = m.pick?.key === "BTTS:YES" ? m.pick.prob : undefined;
                      const leg = past
                        ? null
                        : legFromLite(m, "BTTS:YES", m.probs["BTTS:YES"], settings.modelWeight, {
                            blend,
                            pick: m.pick,
                          });
                      return leg ? (
                        <AddToTicket leg={leg} variant="inline">
                          {shown}
                        </AddToTicket>
                      ) : (
                        shown
                      );
                    })()}
                  </TableCell>

                  <TableCell>
                    {past ? (
                      <Num className="font-medium">
                        {m.homeGoals}:{m.awayGoals}
                      </Num>
                    ) : m.pick ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Badge variant="success">
                          {marketLabel(m.pick.key, m.home, m.away, locale)}
                        </Badge>
                        {pickLeg && <AddToTicket leg={pickLeg} />}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <button
                      type="button"
                      title={locale === "ar" ? "معاينة سريعة" : "Quick view"}
                      aria-label="Quick view"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMatch(m);
                      }}
                      className="rounded p-1 text-muted-foreground opacity-60 transition-opacity hover:bg-secondary hover:text-foreground hover:opacity-100"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Match Quick-View Slide-Over Sheet */}
      <Sheet open={!!selectedMatch} onOpenChange={(open) => !open && setSelectedMatch(null)}>
        <SheetContent side="end" className="w-[92vw] sm:max-w-md overflow-y-auto p-0">
          {selectedMatch && (
            <div className="flex flex-col gap-6 p-6">
              <SheetHeader>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <LeagueLogo
                    code={selectedMatch.league}
                    name={leagueName(selectedMatch.league, locale)}
                    src={logos.league(selectedMatch.league)}
                    size={16}
                  />
                  <span>{leagueName(selectedMatch.league, locale)}</span>
                  <span>,</span>
                  <span>
                    {fmtDate(selectedMatch.kickoff, locale)} <Num>{fmtTime(selectedMatch.kickoff)}</Num>
                  </span>
                </div>
                <SheetTitle className="sr-only">
                  {selectedMatch.home} vs {selectedMatch.away}
                </SheetTitle>
              </SheetHeader>

              {/* Matchup Header Card */}
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  {/* Home */}
                  <div className="flex flex-1 flex-col items-center gap-2 text-center">
                    <TeamLogo
                      name={selectedMatch.home}
                      src={logos.team(selectedMatch.home, selectedMatch.league)}
                      size={44}
                    />
                    <div className="font-semibold text-sm leading-tight line-clamp-2">
                      {selectedMatch.home}
                    </div>
                    <TeamForm form={teamForms?.[selectedMatch.home]} size="sm" />
                  </div>

                  {/* Middle score or vs */}
                  <div className="flex flex-col items-center justify-center px-2">
                    {past ? (
                      <div className="text-2xl font-bold tracking-tight">
                        <Num>{selectedMatch.homeGoals} : {selectedMatch.awayGoals}</Num>
                      </div>
                    ) : (
                      <div className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        vs
                      </div>
                    )}
                  </div>

                  {/* Away */}
                  <div className="flex flex-1 flex-col items-center gap-2 text-center">
                    <TeamLogo
                      name={selectedMatch.away}
                      src={logos.team(selectedMatch.away, selectedMatch.league)}
                      size={44}
                    />
                    <div className="font-semibold text-sm leading-tight line-clamp-2">
                      {selectedMatch.away}
                    </div>
                    <TeamForm form={teamForms?.[selectedMatch.away]} size="sm" />
                  </div>
                </div>
              </div>

              {/* Dixon-Coles Probabilities & xG */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>{locale === "ar" ? "احتمالات ديسكون-كولز" : "Model Probabilities (1X2)"}</span>
                  {selectedMatch.xgHome != null && selectedMatch.xgAway != null && (
                    <span className="text-xs text-muted-foreground">
                      xG <Num className="font-semibold text-foreground">{selectedMatch.xgHome.toFixed(2)} : {selectedMatch.xgAway.toFixed(2)}</Num>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-secondary/60 p-2.5">
                    <div className="text-[11px] text-muted-foreground truncate">{selectedMatch.home}</div>
                    <div className="mt-1 text-lg font-bold text-foreground">
                      <Num>{pct(selectedMatch.probs["1X2:HOME"], 1)}</Num>
                    </div>
                  </div>
                  <div className="rounded-lg bg-secondary/60 p-2.5">
                    <div className="text-[11px] text-muted-foreground">{t.table.draw}</div>
                    <div className="mt-1 text-lg font-bold text-foreground">
                      <Num>{pct(selectedMatch.probs["1X2:DRAW"], 1)}</Num>
                    </div>
                  </div>
                  <div className="rounded-lg bg-secondary/60 p-2.5">
                    <div className="text-[11px] text-muted-foreground truncate">{selectedMatch.away}</div>
                    <div className="mt-1 text-lg font-bold text-foreground">
                      <Num>{pct(selectedMatch.probs["1X2:AWAY"], 1)}</Num>
                    </div>
                  </div>
                </div>

                {/* Additional markets */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between rounded-lg border bg-card p-2.5">
                    <span className="text-muted-foreground">{t.table.over25}</span>
                    <span className="font-semibold">
                      <Num>{pct(selectedMatch.probs["OU2.5:OVER"], 1)}</Num>
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border bg-card p-2.5">
                    <span className="text-muted-foreground">{t.table.btts}</span>
                    <span className="font-semibold">
                      <Num>{pct(selectedMatch.probs["BTTS:YES"], 1)}</Num>
                    </span>
                  </div>
                </div>
              </div>

              {/* Best Value Pick */}
              {selectedMatch.pick && !past && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <Sparkles className="h-4 w-4" />
                    <span>{locale === "ar" ? "أفضل قيمة متوقعة" : "Best Value Pick"}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-foreground text-sm">
                        {marketLabel(selectedMatch.pick.key, selectedMatch.home, selectedMatch.away, locale)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {locale === "ar" ? "الاحتمال: " : "Prob: "}
                        <Num>{pct(selectedMatch.pick.prob)}</Num> ·{" "}
                        {locale === "ar" ? "الاحتمالات: " : "Odds: "}
                        <Num>{selectedMatch.pick.odds.toFixed(2)}</Num>
                      </div>
                    </div>
                    {(() => {
                      const pickLeg = legFromLite(
                        selectedMatch,
                        selectedMatch.pick.key,
                        selectedMatch.pick.modelProb,
                        settings.modelWeight,
                        {
                          blend: selectedMatch.pick.prob,
                          odds: selectedMatch.pick.odds,
                          pick: selectedMatch.pick,
                        }
                      );
                      return pickLeg ? <AddToTicket leg={pickLeg} /> : null;
                    })()}
                  </div>
                </div>
              )}

              {/* AI Headline review if available */}
              {selectedMatch.headline && (
                <div className="rounded-xl border bg-secondary/30 p-4 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span>{locale === "ar" ? "ملاحظة المحلل الذكي" : "Analyst Note"}</span>
                  </div>
                  <p className="mt-1.5 text-foreground leading-relaxed italic">
                    &ldquo;{selectedMatch.headline}&rdquo;
                  </p>
                </div>
              )}

              {/* Action Link to Full Match Page */}
              <div className="mt-auto pt-4 border-t">
                <Link
                  href={`/matches/${encodeURIComponent(selectedMatch.id)}`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
                >
                  <span>{locale === "ar" ? "التحليل الكامل للمباراة" : "Open Full Match Analysis"}</span>
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </Link>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

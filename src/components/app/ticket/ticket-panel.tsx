"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, Info, Link2, LoaderCircle, OctagonAlert, PanelRightClose, Sparkles, Ticket, TriangleAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Num } from "@/components/app/num";
import { dirOf } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { marketLabel } from "@/lib/model/markets";
import { legEdge, legId, riskLevel, RISK_ORDER, type RiskLevel, type TicketLeg } from "@/lib/model/ticket";
import { QUICK_STAKES, ticketAdvice, type Advice, type Tip, type TipAction } from "@/lib/model/ticket-advice";
import { cn, fmtTime, ltr, pct } from "@/lib/utils";
import { useTicket, type TicketState } from "./ticket-provider";
import { useCountUp } from "./use-count-up";

type Panel = Omit<TicketState, "stake"> &
  Advice & {
    /** Stake used in the numbers: what the user typed, else the suggestion. */
    stake: number;
    stakeIsAuto: boolean;
    apply: (action: TipAction) => void;
  };

const PanelContext = createContext<Panel | null>(null);

/** The ticket's state plus its maths and advice, computed once per panel. */
function usePanel() {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error("usePanel() must be used inside <AdviceProvider>");
  return ctx;
}

function AdviceProvider({ children }: { children: React.ReactNode }) {
  const state = useTicket();
  const { locale } = useT();
  const { legs, stake, config, add, remove, setStake } = state;
  const advice = useMemo(
    () => ticketAdvice({ legs, stake, name: config.name, locale, rules: config.rules, currency: config.currency, suggestions: config.suggestions }),
    [legs, stake, config, locale]
  );
  const apply = (a: TipAction) => (a.kind === "remove" ? remove(a.legId) : a.kind === "add" ? add(a.leg) : setStake(a.amount));
  const value: Panel = { ...state, ...advice, stake: stake ?? advice.suggestedStake, stakeIsAuto: stake == null, apply };
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

const signedPct = (x: number, d = 1) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(d)}%`;
const amount = (x: number) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signedAmount = (x: number) => `${x >= 0 ? "+" : "−"}${amount(Math.abs(x))}`;
const parseNumber = (s: string) => Number(s.replace(",", ".").trim());
const parseOdds = (s: string) => {
  const n = parseNumber(s);
  return s.trim() && Number.isFinite(n) && n > 1 ? n : null;
};

const RISK_TONE: Record<RiskLevel, { text: string; stroke: string; badge: string }> = {
  low: { text: "text-success", stroke: "stroke-success", badge: "bg-success/15 text-success" },
  medium: { text: "text-warning", stroke: "stroke-warning", badge: "bg-warning/15 text-warning" },
  high: { text: "text-destructive", stroke: "stroke-destructive", badge: "bg-destructive/12 text-destructive" },
  veryHigh: { text: "text-destructive", stroke: "stroke-destructive", badge: "bg-destructive text-destructive-foreground" },
};

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex text-muted-foreground hover:text-foreground" aria-label={typeof children === "string" ? children : undefined}>
          <Info className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}

function RiskGauge({ p, level }: { p: number; level: RiskLevel }) {
  const shown = useCountUp(p);
  const arc = "M8 50 A42 42 0 0 1 92 50";
  return (
    <div className="relative h-[66px] w-[120px] shrink-0">
      {/* Mirrored in RTL so the gauge fills from the start side. */}
      <svg viewBox="0 0 100 56" className="h-full w-full rtl:-scale-x-100" aria-hidden>
        <path d={arc} pathLength={100} className="fill-none stroke-secondary" strokeWidth={9} strokeLinecap="round" />
        <path
          d={arc}
          pathLength={100}
          className={cn("fill-none transition-colors duration-300", RISK_TONE[level].stroke)}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.01, Math.min(1, shown)) * 100} 100`}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <Num className={cn("text-xl font-semibold leading-none", RISK_TONE[level].text)}>{(shown * 100).toFixed(shown > 0 && shown < 0.1 ? 1 : 0)}%</Num>
      </div>
    </div>
  );
}

function BigNumber({ label, value, format, tone }: { label: string; value: number | null; format: (v: number) => string; tone?: string }) {
  const shown = useCountUp(value ?? 0);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="label-xs leading-tight">{label}</span>
      <Num className={cn("truncate text-lg font-semibold leading-tight", tone)}>{value == null ? "—" : format(shown)}</Num>
    </div>
  );
}

function OddsInput({ leg, label }: { leg: TicketLeg; label: string }) {
  const { t } = useT();
  const { setOdds } = usePanel();
  const [text, setText] = useState(leg.odds != null ? String(leg.odds) : "");
  // Follow changes made elsewhere (e.g. the same leg shown in another panel).
  useEffect(() => setText((cur) => (parseOdds(cur) === leg.odds ? cur : leg.odds != null ? String(leg.odds) : "")), [leg.odds]);
  return (
    <Input
      dir="ltr"
      inputMode="decimal"
      aria-label={`${t.tickets.odds}: ${label}`}
      placeholder={t.tickets.odds}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        setOdds(legId(leg), parseOdds(e.target.value));
      }}
      className={cn("h-7 w-[76px] px-2 text-xs", leg.odds == null && "border-warning ring-1 ring-warning/40")}
    />
  );
}

function LegRow({ leg }: { leg: TicketLeg }) {
  const { t, locale } = useT();
  const { remove } = usePanel();
  const label = marketLabel(leg.key, leg.home, leg.away, locale);
  const edge = legEdge(leg);
  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium leading-5">{label}</span>
            {leg.modelOnly && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="cursor-help">
                    <Badge variant="outline" className="text-[9px]">{t.tickets.modelOnly}</Badge>
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t.tickets.modelOnlyHint}</TooltipContent>
              </Tooltip>
            )}
            {leg.review && <Badge variant={leg.review.verdict === "AVOID" ? "destructive" : "warning"}>{t.verdict[leg.review.verdict]}</Badge>}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {leg.home} – {leg.away} · <Num>{fmtTime(leg.kickoff)}</Num> {t.common.utc}
          </div>
        </div>
        <button
          type="button"
          onClick={() => remove(legId(leg))}
          aria-label={t.tickets.remove(label)}
          title={t.tickets.remove(label)}
          className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <OddsInput leg={leg} label={label} />
        <span className="text-muted-foreground">
          {t.tickets.chance} <Num className="font-medium text-foreground">{pct(leg.prob)}</Num>
        </span>
        {edge != null && <Num className={cn("ms-auto font-medium", edge >= 0 ? "text-success" : "text-destructive")}>{signedPct(edge)}</Num>}
      </div>
    </div>
  );
}

function StakeControl() {
  const { t, locale } = useT();
  const { stake, stakeIsAuto, setStake, suggestedStake, config } = usePanel();
  const [text, setText] = useState(String(stake));
  useEffect(() => setText((cur) => (parseNumber(cur) === stake ? cur : String(stake))), [stake]);
  // Max stake per bet from Settings; a small bankroll gets a finer slider.
  const cap = stakeCap(config.rules);
  const small = cap < 10;
  const max = small ? Math.max(cap * 4, stake, 1) : Math.max(100, Math.ceil((cap * 2.5) / 10) * 10, Math.ceil(stake / 10) * 10);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="ticket-stake" className="label-xs">{t.tickets.stake}</label>
        <button
          type="button"
          onClick={() => setStake(null)}
          className={cn("text-xs underline-offset-2 hover:underline", stakeIsAuto ? "font-medium text-foreground" : "text-muted-foreground")}
        >
          {t.tickets.suggestedStake(ltr(`${amount(suggestedStake)} ${config.currency}`))}
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          id="ticket-stake"
          dir="ltr"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseNumber(e.target.value);
            if (Number.isFinite(n) && n > 0) setStake(Math.round(n * 100) / 100);
          }}
          onBlur={() => setText(String(stake))}
          className="h-8 w-24 text-sm"
        />
        {QUICK_STAKES.map((q) => (
          <Button key={q} type="button" size="sm" variant={!stakeIsAuto && stake === q ? "default" : "outline"} onClick={() => setStake(q)} className="h-8 px-2.5">
            <Num>{q}</Num>
          </Button>
        ))}
      </div>
      <Slider
        dir={dirOf(locale)}
        min={small ? 0.01 : 1}
        max={max}
        step={small ? 0.01 : 1}
        value={[Math.min(stake, max)]}
        onValueChange={([v]) => setStake(v)}
        thumbLabel={t.tickets.stake}
        className="py-1"
      />
      {stake > cap + 0.01 && <p className="text-xs text-warning">{t.tickets.stakeAboveMax(ltr(`${amount(cap)} ${config.currency}`))}</p>}
    </div>
  );
}

/** Largest stake one ticket may use, like a pick: maxStakePct of the bankroll (the save route checks it too). */
const stakeCap = (r: { bankroll: number; maxStakePct: number }) => Math.floor(Math.max(0, r.bankroll) * r.maxStakePct * 100) / 100;

const TIP_STYLE: Record<Tip["tone"], { box: string; icon: typeof CircleCheck; iconClass: string }> = {
  good: { box: "border-success/30 bg-success/5", icon: CircleCheck, iconClass: "text-success" },
  warn: { box: "border-warning/35 bg-warning/5", icon: TriangleAlert, iconClass: "text-warning" },
  danger: { box: "border-destructive/35 bg-destructive/5", icon: OctagonAlert, iconClass: "text-destructive" },
};

function Tips() {
  const { t } = useT();
  const { tips, apply, config } = usePanel();
  if (!tips.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="label-xs">{t.tickets.advice.title(config.name)}</div>
      <ul className="flex flex-col gap-2">
        {tips.map((tip) => {
          const s = TIP_STYLE[tip.tone];
          return (
            <li key={tip.id} className={cn("flex gap-2 rounded-lg border p-2.5 text-[13px] leading-5", s.box)}>
              <s.icon className={cn("mt-0.5 h-4 w-4 shrink-0", s.iconClass)} strokeWidth={1.8} />
              <div className="flex min-w-0 flex-col gap-2">
                <p>{tip.text}</p>
                {tip.action && (
                  <Button type="button" size="sm" variant="outline" className="h-7 self-start" onClick={() => apply(tip.action!)}>
                    {t.tickets.advice.apply[tip.action.kind]}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Explain() {
  const { t, locale } = useT();
  const { legs, math, stake, tips, config } = usePanel();
  const [answer, setAnswer] = useState<{ status: "idle" | "loading" | "done" | "error"; text: string }>({ status: "idle", text: "" });
  const abort = useRef<AbortController | null>(null);
  const signature = JSON.stringify([legs.map((l) => [legId(l), l.odds]), stake, locale]);

  // A changed ticket makes the old answer wrong.
  useEffect(() => {
    abort.current?.abort();
    setAnswer({ status: "idle", text: "" });
  }, [signature]);
  useEffect(() => () => abort.current?.abort(), []);

  const ask = async () => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setAnswer({ status: "loading", text: "" });
    try {
      const res = await fetch("/api/ticket/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          name: config.name,
          currency: config.currency,
          stake,
          prob: math.prob,
          totalOdds: math.totalOdds,
          ev: math.ev,
          margin: math.margin,
          legs: legs.map((l) => ({
            match: `${l.home} vs ${l.away}`,
            label: l.label,
            odds: l.odds,
            prob: l.prob,
            edge: legEdge(l),
            modelOnly: l.modelOnly,
            sameMatch: legs.filter((x) => x.matchId === l.matchId).length > 1,
            review: l.review ? `${l.review.verdict}: ${l.review.headline}` : null,
          })),
          tips: tips.map((x) => x.text),
        }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setAnswer({ status: "error", text: j.error ?? t.tickets.explain.error });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setAnswer({ status: "loading", text });
      }
      setAnswer({ status: text.trim() ? "done" : "error", text: text.trim() || t.tickets.explain.error });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setAnswer({ status: "error", text: t.tickets.explain.error });
    }
  };

  if (!config.provider.keySet) return <p className="text-xs text-muted-foreground">{t.tickets.explain.noKey(config.provider.name, config.provider.keyEnv)}</p>;
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" size="sm" onClick={ask} disabled={answer.status === "loading"} className="self-start">
        {answer.status === "loading" ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
        {answer.status === "loading" ? t.tickets.explain.loading : t.tickets.explain.button}
      </Button>
      {answer.text && (
        <div className={cn("rounded-lg border p-3 text-[13px] leading-6", answer.status === "error" ? "border-destructive/30 text-destructive" : "bg-card")}>
          <p dir="auto" className="whitespace-pre-wrap">{answer.text}</p>
          {answer.status === "done" && <p className="mt-2 text-[11px] text-muted-foreground">{t.tickets.explain.by(config.provider.name)}</p>}
        </div>
      )}
    </div>
  );
}

function SaveBar() {
  const { t } = useT();
  const router = useRouter();
  const { legs, math, stake, clear, config } = usePanel();
  const [state, setState] = useState<{ status: "idle" | "saving" | "saved" | "error"; msg?: string; signature?: string }>({ status: "idle" });
  const signature = JSON.stringify([legs.map((l) => [legId(l), l.odds]), stake]);
  const saved = state.status === "saved" && state.signature === signature;
  const cap = stakeCap(config.rules);
  const capText = ltr(`${amount(cap)} ${config.currency}`);
  const blocked =
    math.missingOdds.length > 0 ? t.tickets.needOdds : math.contradictory ? t.tickets.contradiction : stake > cap + 0.01 ? t.tickets.stakeAboveMax(capText) : null;
  const errorText = (code?: string) =>
    code === "STAKE_ABOVE_MAX" ? t.tickets.stakeAboveMax(capText) : code === "CONTRADICTION" ? t.tickets.contradiction : code === "STARTED" ? t.tickets.matchStarted : t.tickets.saveError;

  const save = async () => {
    setState({ status: "saving" });
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stake, legs: legs.map((l) => ({ matchId: l.matchId, key: l.key, odds: l.odds })) }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) {
      setState({ status: "saved", signature });
      router.refresh();
    } else setState({ status: "error", msg: errorText(j.code) });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={clear} className="flex-1">{t.tickets.clear}</Button>
        <Button type="button" onClick={save} disabled={!!blocked || saved || state.status === "saving" || !(stake > 0)} className="flex-[2]">
          {state.status === "saving" ? t.tickets.saving : saved ? <><CircleCheck />{t.tickets.saved.split(".")[0]}</> : t.tickets.save}
        </Button>
      </div>
      {blocked && <p className="text-xs text-muted-foreground">{blocked}</p>}
      {saved && (
        <Link href="/history?view=tickets" className="text-xs text-success underline-offset-2 hover:underline">{t.tickets.saved}</Link>
      )}
      {state.status === "error" && <p className="text-xs text-destructive">{state.msg}</p>}
    </div>
  );
}

/** The ticket: legs, stake, numbers, risk, tips. Shared by the desktop dock and the mobile sheet. */
export function TicketPanel({ onHide, className }: { onHide?: () => void; className?: string }) {
  const { t } = useT();
  const { legs, math, stake, hydrated, config } = usePanel();
  const level = legs.length ? riskLevel(math.prob) : null;
  const danger = level === "high" || level === "veryHigh";

  // Shake once when the risk gets worse and lands on high / very high, then stay calm.
  const prev = useRef<RiskLevel | null>(null);
  const [alarm, setAlarm] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    const before = prev.current;
    prev.current = level;
    if (!before || !level || !(level === "high" || level === "veryHigh")) return;
    if (RISK_ORDER.indexOf(level) <= RISK_ORDER.indexOf(before)) return;
    setAlarm(true);
    const id = setTimeout(() => setAlarm(false), 1900);
    return () => clearTimeout(id);
  }, [level, hydrated]);

  const ret = math.totalOdds != null ? stake * math.totalOdds : null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex flex-col gap-5 p-5", className)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Ticket className="h-[18px] w-[18px]" strokeWidth={1.6} />
            <h2 className="font-semibold">{t.tickets.title}</h2>
            {legs.length > 0 && <Badge variant="secondary"><Num>{legs.length}</Num></Badge>}
          </div>
          {onHide && (
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={onHide} aria-label={t.tickets.hide} title={t.tickets.hide}>
              <PanelRightClose className="rtl:-scale-x-100" />
            </Button>
          )}
        </div>

        {legs.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t.tickets.empty}</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {math.groups.map((g) => (
                <div
                  key={g.matchId}
                  className={cn(
                    "rounded-lg border bg-card px-3",
                    g.correlated && "bg-secondary/40",
                    g.contradictions.length > 0 && "border-destructive/50 bg-destructive/5"
                  )}
                >
                  <div className="divide-y">
                    {g.legs.map((l) => (
                      <LegRow key={legId(l)} leg={l} />
                    ))}
                  </div>
                  {g.correlated && (
                    <div className={cn("flex items-center gap-1.5 border-t py-2 text-xs", g.contradictions.length ? "font-medium text-destructive" : "text-muted-foreground")}>
                      {g.contradictions.length ? <OctagonAlert className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                      {g.contradictions.length ? t.tickets.contradiction : <>{t.tickets.sameMatch} <Num className="text-foreground">{pct(g.prob)}</Num></>}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {math.contradictory && (
              <div role="alert" className="flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground">
                <OctagonAlert className="h-4 w-4 shrink-0" />
                {t.tickets.contradiction}
              </div>
            )}

            <StakeControl />

            <div className="grid grid-cols-3 gap-3 rounded-lg bg-secondary p-3">
              <BigNumber label={t.tickets.totalOdds} value={math.totalOdds} format={(v) => v.toFixed(2)} />
              <BigNumber label={t.tickets.potentialReturn} value={ret} format={amount} />
              <BigNumber label={t.tickets.profitIfWins} value={ret != null ? ret - stake : null} format={signedAmount} tone="text-success" />
            </div>

            {level && (
              <div
                className={cn(
                  "flex items-center gap-4 rounded-lg border bg-card p-3 transition-colors duration-300",
                  danger && "border-destructive/40 bg-destructive/5",
                  alarm && "motion-safe:animate-shake"
                )}
              >
                <RiskGauge p={math.prob} level={level} />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs">
                  <span className="label-xs">{t.tickets.winChance}</span>
                  <span className={cn("self-start rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", RISK_TONE[level].badge, alarm && danger && "motion-safe:animate-risk-pulse")}>
                    {t.tickets.risk[level]}
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-muted-foreground">{t.tickets.ev}<Hint>{t.tickets.evHint}</Hint></span>
                    {math.ev != null ? (
                      <Num className={cn("font-semibold", math.ev >= 0 ? "text-success" : "text-destructive")}>
                        {signedPct(math.ev)} · {signedAmount(stake * math.ev)}
                      </Num>
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-muted-foreground">{t.tickets.margin}<Hint>{t.tickets.marginHint}</Hint></span>
                    <Num className="font-medium">{math.margin != null ? signedPct(math.margin) : "—"}</Num>
                  </div>
                </div>
              </div>
            )}
            <p className="-mt-3 text-[11px] text-muted-foreground">
              {t.tickets.stake}: <Num>{amount(stake)} {config.currency}</Num>
            </p>

            <Tips />
            <Explain />
            <SaveBar />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

/** Desktop (xl and up): sticky panel on the end side of the page. Hidden while the ticket is empty or collapsed. */
export function TicketDock() {
  return (
    <AdviceProvider>
      <Dock />
    </AdviceProvider>
  );
}

function Dock() {
  const { hydrated, legs, collapsed, setCollapsed } = usePanel();
  if (!hydrated || !legs.length || collapsed) return null;
  return (
    <aside data-ticket-dock className="hidden w-[360px] shrink-0 border-s bg-sidebar xl:block">
      <div className="sticky top-0 h-screen lg:top-6 lg:h-[calc(100vh-3rem)]">
        <ScrollArea className="h-full">
          <TicketPanel onHide={() => setCollapsed(true)} />
        </ScrollArea>
      </div>
    </aside>
  );
}

/** Floating "Ticket · 3 · 6.42" button: opens the sheet on small screens, brings the dock back on desktop. */
export function TicketFloating() {
  return (
    <AdviceProvider>
      <Floating />
    </AdviceProvider>
  );
}

function Floating() {
  const { t } = useT();
  const { hydrated, legs, math, collapsed, setCollapsed, sheetOpen, setSheetOpen } = usePanel();
  if (!hydrated) return null;
  const level = legs.length ? riskLevel(math.prob) : null;
  const open = () => {
    if (window.matchMedia("(min-width: 1280px)").matches) setCollapsed(false);
    else setSheetOpen(true);
  };
  return (
    <>
      {legs.length > 0 && (
        <button
          type="button"
          onClick={open}
          aria-label={t.tickets.open}
          className={cn(
            "fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit items-center gap-2.5 rounded-full bg-foreground py-3 pe-5 ps-4 text-sm font-medium text-background shadow-float transition-transform hover:scale-[1.02] motion-reduce:transition-none",
            !collapsed && "xl:hidden"
          )}
        >
          <Ticket className="h-4 w-4" strokeWidth={1.8} />
          <span>{t.tickets.floating(ltr(legs.length), ltr(math.totalOdds != null ? math.totalOdds.toFixed(2) : "—"))}</span>
          {level && <span className={cn("h-2 w-2 rounded-full", level === "low" ? "bg-success" : level === "medium" ? "bg-warning" : "bg-destructive")} aria-hidden />}
        </button>
      )}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" closeLabel={t.tickets.hide} className="gap-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{t.tickets.title}</SheetTitle>
            <SheetDescription>{t.tickets.winChance}</SheetDescription>
          </SheetHeader>
          <div className="max-h-[88dvh] overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
            <TicketPanel className="pe-12 [&>div:first-child]:pe-0" />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

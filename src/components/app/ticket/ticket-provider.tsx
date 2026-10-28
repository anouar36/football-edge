"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { legId, type TicketLeg } from "@/lib/model/ticket";
import type { StakeRules } from "@/lib/model/value";

export interface TicketConfig {
  name: string;
  currency: string;
  rules: StakeRules;
  provider: { name: string; keySet: boolean; keyEnv: string };
  /** Open value picks the advice may suggest adding. */
  suggestions: TicketLeg[];
}

const FALLBACK: TicketConfig = {
  name: "Anouar",
  currency: "MAD",
  rules: { bankroll: 1000, kellyFraction: 0.25, maxStakePct: 0.02, minEdge: 0.04, minProb: 0.3, minOdds: 1.4, maxOdds: 4.5, modelWeight: 0.5 },
  provider: { name: "Claude", keySet: false, keyEnv: "ANTHROPIC_API_KEY" },
  suggestions: [],
};

const STORAGE_KEY = "edgexi.ticket.v1";
/** Legs of matches that kicked off longer ago than this are dropped on load (same window as the Matches page). */
const STALE_MS = 3 * 3_600_000;

interface Stored {
  legs: TicketLeg[];
  /** Null = follow the suggested stake. */
  stake: number | null;
}

/**
 * The ticket's state only (legs, stake, panel visibility). The maths, the advice and the panel itself
 * live in ticket-panel.tsx, loaded on demand once the ticket has a leg (ticket-lazy.tsx).
 */
export interface TicketState {
  config: TicketConfig;
  hydrated: boolean;
  legs: TicketLeg[];
  /** What the user typed; null = the suggested stake. */
  stake: number | null;
  setStake: (stake: number | null) => void;
  has: (id: string) => boolean;
  add: (leg: TicketLeg) => void;
  toggle: (leg: TicketLeg) => void;
  remove: (id: string) => void;
  setOdds: (id: string, odds: number | null) => void;
  clear: () => void;
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
  /** Desktop: the docked panel is hidden behind the floating button. */
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

const TicketContext = createContext<TicketState | null>(null);

export function useTicket() {
  const ctx = useContext(TicketContext);
  if (!ctx) throw new Error("useTicket() must be used inside <TicketProvider>");
  return ctx;
}

function load(): Stored {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { legs: [], stake: null };
    const s = JSON.parse(raw) as Partial<Stored>;
    const now = Date.now();
    const legs = Array.isArray(s.legs) ? s.legs.filter((l) => l && typeof l.key === "string" && new Date(l.kickoff).getTime() > now - STALE_MS) : [];
    return { legs, stake: typeof s.stake === "number" && s.stake > 0 ? s.stake : null };
  } catch {
    return { legs: [], stake: null };
  }
}

export function TicketProvider({ config, children }: { config: TicketConfig | null; children: React.ReactNode }) {
  const cfg = config ?? FALLBACK;
  const [state, setState] = useState<Stored>({ legs: [], stake: null });
  const [hydrated, setHydrated] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    setState(load());
    try {
      setCollapsedState(window.localStorage.getItem(`${STORAGE_KEY}.collapsed`) === "1");
    } catch {
      /* storage blocked: start expanded */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked: the ticket lives until the tab closes */
    }
  }, [state, hydrated]);

  const setCollapsed = useCallback((c: boolean) => {
    setCollapsedState(c);
    try {
      window.localStorage.setItem(`${STORAGE_KEY}.collapsed`, c ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const ids = useMemo(() => new Set(state.legs.map(legId)), [state.legs]);
  const has = useCallback((id: string) => ids.has(id), [ids]);
  const remove = useCallback((id: string) => setState((s) => ({ ...s, legs: s.legs.filter((l) => legId(l) !== id) })), []);
  const add = useCallback(
    (leg: TicketLeg) => setState((s) => (s.legs.some((l) => legId(l) === legId(leg)) ? s : { ...s, legs: [...s.legs, leg] })),
    []
  );
  const toggle = useCallback((leg: TicketLeg) => (ids.has(legId(leg)) ? remove(legId(leg)) : add(leg)), [ids, add, remove]);
  const setOdds = useCallback(
    (id: string, odds: number | null) => setState((s) => ({ ...s, legs: s.legs.map((l) => (legId(l) === id ? { ...l, odds } : l)) })),
    []
  );
  const setStake = useCallback((stake: number | null) => setState((s) => ({ ...s, stake })), []);
  const clear = useCallback(() => setState({ legs: [], stake: null }), []);

  const value: TicketState = {
    config: cfg,
    hydrated,
    legs: state.legs,
    stake: state.stake,
    setStake,
    has,
    add,
    toggle,
    remove,
    setOdds,
    clear,
    sheetOpen,
    setSheetOpen,
    collapsed,
    setCollapsed,
  };
  return <TicketContext.Provider value={value}>{children}</TicketContext.Provider>;
}

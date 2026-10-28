"use client";
import dynamic from "next/dynamic";
import { useTicket } from "./ticket-provider";

// The panel (Radix sheet, slider, tooltips, the ticket maths and the advice rules) is its own chunk,
// downloaded only once the ticket has a leg: an empty ticket costs no JavaScript beyond the provider.
const Dock = dynamic(() => import("./ticket-panel").then((m) => m.TicketDock), { ssr: false });
const Floating = dynamic(() => import("./ticket-panel").then((m) => m.TicketFloating), { ssr: false });

/** Desktop side panel, in the shell's flex row after <main>. */
export function TicketDockSlot() {
  const { hydrated, legs, collapsed } = useTicket();
  return hydrated && legs.length > 0 && !collapsed ? <Dock /> : null;
}

/** Floating button and mobile sheet. */
export function TicketFloatingSlot() {
  const { hydrated, legs, sheetOpen } = useTicket();
  return hydrated && (legs.length > 0 || sheetOpen) ? <Floating /> : null;
}

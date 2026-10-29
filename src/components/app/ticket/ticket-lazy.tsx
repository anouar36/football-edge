"use client";
import { TicketDock, TicketFloating } from "./ticket-panel";
import { useTicket } from "./ticket-provider";

/** Desktop side panel, in the shell's flex row after <main>. */
export function TicketDockSlot() {
  const { hydrated, legs, collapsed } = useTicket();
  return hydrated && legs.length > 0 && !collapsed ? <TicketDock /> : null;
}

/** Floating button and mobile sheet. */
export function TicketFloatingSlot() {
  const { hydrated, legs, sheetOpen } = useTicket();
  return hydrated && (legs.length > 0 || sheetOpen) ? <TicketFloating /> : null;
}

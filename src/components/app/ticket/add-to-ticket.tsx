"use client";
import { Check, Plus } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { marketLabel } from "@/lib/model/markets";
import { legId, type TicketLeg } from "@/lib/model/ticket";
import { cn } from "@/lib/utils";
import { useTicket } from "./ticket-provider";

/**
 * "Add to ticket" toggle. `icon` is a small square button; `inline` wraps its children
 * (a probability, a badge) and adds the +/check icon after them.
 */
export function AddToTicket({ leg, variant = "icon", className, children }: { leg: TicketLeg; variant?: "icon" | "inline"; className?: string; children?: React.ReactNode }) {
  const { has, toggle } = useTicket();
  const { t, locale } = useT();
  const on = has(legId(leg));
  const label = marketLabel(leg.key, leg.home, leg.away, locale);
  const title = on ? t.tickets.remove(label) : t.tickets.add(label);
  const Icon = on ? Check : Plus;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={title}
      title={title}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(leg);
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        variant === "icon" && cn("h-6 w-6 rounded-md border", on ? "border-foreground bg-foreground text-background" : "border-input bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground"),
        variant === "inline" && cn("gap-1 rounded-md px-1.5 py-0.5", on ? "bg-accent text-foreground" : "hover:bg-secondary"),
        className
      )}
    >
      {children}
      <Icon className={cn(variant === "icon" ? "h-3.5 w-3.5" : "h-3 w-3", variant === "inline" && !on && "text-muted-foreground")} strokeWidth={2.2} />
    </button>
  );
}

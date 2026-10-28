import { activeProvider } from "@/lib/llm";
import { cachedSettings, upcomingPicksLite } from "@/lib/data";
import { suggestionLegs } from "@/lib/ticket-legs";
import { TicketProvider, type TicketConfig } from "./ticket-provider";

async function loadConfig(): Promise<TicketConfig | null> {
  try {
    const [s, picks] = await Promise.all([cachedSettings(), upcomingPicksLite()]);
    const p = activeProvider(s);
    return {
      name: s.displayName,
      currency: s.currency,
      rules: {
        bankroll: s.bankroll,
        kellyFraction: s.kellyFraction,
        maxStakePct: s.maxStakePct,
        minEdge: s.minEdge,
        minProb: s.minProb,
        minOdds: s.minOdds,
        maxOdds: s.maxOdds,
        modelWeight: s.modelWeight,
      },
      provider: { name: p.name, keySet: p.keySet, keyEnv: p.keyEnv },
      suggestions: suggestionLegs(picks, s.modelWeight),
    };
  } catch (e) {
    // The pages show their own database error; the ticket falls back to default rules.
    console.error("[ticket] could not load settings:", (e as Error).message);
    return null;
  }
}

/** Server side of the ticket: the staking rules and today's open value picks, from the data cache. */
export async function TicketRoot({ children }: { children: React.ReactNode }) {
  return <TicketProvider config={await loadConfig()}>{children}</TicketProvider>;
}

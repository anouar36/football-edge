import { redirect } from "next/navigation";
import { Sidebar } from "@/components/app/sidebar";
import { ReloadOnRestore } from "@/components/app/auth/reload-on-restore";
import { TicketRoot } from "@/components/app/ticket/ticket-root";
import { TicketDockSlot, TicketFloatingSlot } from "@/components/app/ticket/ticket-lazy";
import { getSession } from "@/lib/auth/server";
import { cachedSettings } from "@/lib/data";
import { activeProvider } from "@/lib/llm";

/** The sidebar still renders (with the default provider) when the settings cannot be read, so the error page shows inside the app. */
async function analyst() {
  const p = await cachedSettings()
    .then(activeProvider)
    .catch(() => activeProvider({ llmProvider: "anthropic", llmModel: null }));
  return { name: p.name, keySet: p.keySet };
}

/**
 * Every dashboard page. The middleware already sends signed-out visitors to /login; this checks again and gives the sidebar the user.
 * Rendered once per full page load: client-side navigation keeps this layout and only fetches the page below it.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Both usually answer without the database: the session from its signed cookie, the settings from the data cache.
  const [session, ai] = await Promise.all([getSession(), analyst()]);
  if (!session) redirect("/login");
  return (
    <TicketRoot>
      {/* overflow-clip, not overflow-hidden: same rounded clipping, but the ticket dock can stay sticky. */}
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1400px] flex-col overflow-clip bg-background lg:flex-row lg:rounded-[28px] lg:shadow-card xl:has-[[data-ticket-dock]]:max-w-[1760px]">
        <ReloadOnRestore />
        <Sidebar analyst={ai} user={{ name: session.user.name, email: session.user.email }} />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10 lg:py-9">{children}</main>
        <TicketDockSlot />
      </div>
      <TicketFloatingSlot />
    </TicketRoot>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Home, ListChecks, Settings, Ticket } from "lucide-react";
import { LanguageSwitch } from "@/components/app/language-switch";
import { ThemeSwitch } from "@/components/app/theme-switch";
import { Logo } from "@/components/app/logo";
import { SignOutButton } from "@/components/app/auth/sign-out-button";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", key: "dashboard", icon: Home },
  { href: "/picks", key: "picks", icon: ListChecks },
  { href: "/matches", key: "matches", icon: CalendarDays },
  { href: "/slip", key: "slip", icon: Ticket },
  { href: "/history", key: "history", icon: BarChart3 },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

/** On the left in English and on the right in Arabic: the layout is a flex row that follows dir. */
export function Sidebar({ analyst, user }: { analyst: { name: string; keySet: boolean }; user: { name: string; email: string } }) {
  const path = usePathname();
  const { t } = useT();
  return (
    <>
      {/* desktop */}
      <aside className="hidden w-[228px] shrink-0 flex-col border-e bg-sidebar px-4 py-8 lg:flex">
        <Link href="/" className="px-3">
          <Logo className="text-[22px]" />
        </Link>
        <nav className="mt-10 flex flex-col gap-1">
          {NAV.map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground/80 transition-colors hover:bg-secondary",
                isActive(path, href) && "bg-sidebar-active font-medium text-foreground hover:bg-sidebar-active"
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
              {t.nav[key]}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <LanguageSwitch />
            <ThemeSwitch />
          </div>
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-xs font-semibold">AI</div>
            <div className="leading-tight">
              <div className="text-sm font-medium">{t.sidebar.analyst(analyst.name)}</div>
              <div className="text-xs text-muted-foreground">{analyst.keySet ? t.sidebar.connected : t.sidebar.noKey}</div>
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t pt-4">
            <div className="flex items-center gap-3 px-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                {(user.name || user.email).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm font-medium">{user.name}</div>
                <div dir="ltr" className="truncate text-[11px] text-muted-foreground rtl:text-right" title={user.email}>{user.email}</div>
              </div>
            </div>
            <SignOutButton className="w-full" />
          </div>
        </div>
      </aside>
      {/* mobile */}
      <header className="sticky top-0 z-20 border-b bg-sidebar/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Logo className="text-lg" />
          <div className="flex items-center gap-1.5">
            <LanguageSwitch />
            <ThemeSwitch className="w-24 text-[11px]" />
            <SignOutButton iconOnly />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
          {NAV.map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs",
                isActive(path, href) ? "bg-sidebar-active font-medium" : "text-foreground/70"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.nav[key]}
            </Link>
          ))}
        </nav>
      </header>
    </>
  );
}

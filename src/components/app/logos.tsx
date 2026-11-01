import type { Logos } from "@/lib/queries";
import { LEAGUES } from "@/lib/data/leagues";
import { cn } from "@/lib/utils";
import { LogoImage } from "./logo-image";

export function TeamMark({ name, className }: { name: string; className?: string }) {
  const initials = name
    .replace(/[^A-Za-z' ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  // deterministic hue per team
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <div
      className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white", className)}
      style={{ background: `hsl(${h} 45% 38%)` }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

/** TheSportsDB serves smaller copies of each image at <url>/tiny (50px) and <url>/small (250px). */
const sized = (src: string, size: number) => (/\.thesportsdb\.com\/images\//.test(src) ? `${src}/${size <= 24 ? "tiny" : "small"}` : src);

/** Team badge, or the coloured initials when there is no logo or it fails to load. */
export function TeamLogo({ name, src, size = 32, className }: { name: string; src: string | null; size?: number; className?: string }) {
  const mark = (
    <span className={cn("inline-flex shrink-0", className)} style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.28)) }}>
      <TeamMark name={name} className="h-full w-full rounded-[22%] text-[1em]" />
    </span>
  );
  return src ? <LogoImage src={sized(src, size)} alt={name} size={size} className={className} fallback={mark} /> : mark;
}

/** League badge, or its initials on a neutral tile. */
export function LeagueLogo({ code, name, src, size = 16, className }: { code: string; name: string; src: string | null; size?: number; className?: string }) {
  const initials = (LEAGUES[code]?.name ?? code)
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const mark = (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[22%] bg-secondary font-bold leading-none text-muted-foreground", className)}
      style={{ width: size, height: size, fontSize: Math.max(6, Math.round(size * 0.42)) }}
      aria-hidden
    >
      {initials}
    </span>
  );
  return src ? <LogoImage src={sized(src, size)} alt={name} size={size} className={className} fallback={mark} /> : mark;
}

/** Home and away badges side by side for list rows. In RTL home sits on the right, like the names. */
export function TeamPair({ match, logos, size = 22 }: { match: { home: string; away: string; league: string }; logos: Logos; size?: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <TeamLogo name={match.home} src={logos.team(match.home, match.league)} size={size} />
      <TeamLogo name={match.away} src={logos.team(match.away, match.league)} size={size} />
    </span>
  );
}

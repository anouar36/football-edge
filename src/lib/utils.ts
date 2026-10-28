import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { intlLocale, type Locale } from "./i18n/config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const pct = (x: number | null | undefined, d = 1) =>
  x == null || Number.isNaN(x) ? "—" : `${(x * 100).toFixed(d)}%`;

export const money = (x: number | null | undefined, currency = "MAD") =>
  x == null ? "—" : `${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export const signed = (x: number, d = 2) => `${x >= 0 ? "+" : ""}${x.toFixed(d)}`;

/**
 * Keeps a number, score, range or amount left-to-right inside translated text
 * (Unicode isolate, the string form of <bdi dir="ltr">). Without it Arabic text
 * shows "+4.5%" as "4.5%+" and "2–1" as "1–2".
 */
export const ltr = (s: string | number) => `⁦${s}⁩`;

export const fmtDate = (d: Date | string, locale: Locale = "en") =>
  new Date(d).toLocaleDateString(intlLocale(locale), { day: "2-digit", month: "short", year: "numeric" });

export const fmtDay = (d: Date | string, locale: Locale = "en") =>
  new Date(d).toLocaleDateString(intlLocale(locale), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export const fmtTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

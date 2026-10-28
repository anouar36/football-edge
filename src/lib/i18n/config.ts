export type Locale = "ar" | "en";

export const LOCALES: Locale[] = ["ar", "en"];
export const DEFAULT_LOCALE: Locale = "ar";
export const LOCALE_COOKIE = "locale";

export const isLocale = (v: unknown): v is Locale => v === "ar" || v === "en";
export const dirOf = (l: Locale) => (l === "ar" ? "rtl" : "ltr");
/** For Intl date formatting. "ar-MA" writes Arabic month names with Latin digits. */
export const intlLocale = (l: Locale) => (l === "ar" ? "ar-MA" : "en-GB");

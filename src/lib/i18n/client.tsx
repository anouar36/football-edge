"use client";
import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, dictionaries, LOCALE_COOKIE, type Locale } from ".";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Mounted once in the root layout with the locale read from the cookie. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** `const { t, locale } = useT()` in client components. */
export function useT() {
  const locale = useContext(LocaleContext);
  return { t: dictionaries[locale], locale };
}

export function saveLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

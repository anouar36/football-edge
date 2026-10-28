import { cookies } from "next/headers";
import { DEFAULT_LOCALE, dictionaries, isLocale, LOCALE_COOKIE, type Locale } from ".";

/** Locale from the "locale" cookie (default Arabic). Server components only. */
export function getLocale(): Locale {
  const v = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** `const { t, locale } = getT()` in server components. Client components use useT(). */
export function getT() {
  const locale = getLocale();
  return { t: dictionaries[locale], locale };
}

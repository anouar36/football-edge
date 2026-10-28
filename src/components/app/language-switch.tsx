"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALES, type Locale } from "@/lib/i18n";
import { saveLocale, useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const NAMES: Record<Locale, string> = { ar: "العربية", en: "English" };

/** العربية / English. Stores the "locale" cookie and re-renders the page on the server. */
export function LanguageSwitch({ className }: { className?: string }) {
  const { t, locale } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div
      role="radiogroup"
      aria-label={t.language.label}
      suppressHydrationWarning
      className={cn("flex gap-1 rounded-lg bg-secondary p-1 text-xs", pending && "opacity-60", className)}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={locale === l}
          lang={l}
          disabled={pending}
          suppressHydrationWarning
          onClick={() => {
            if (l === locale) return;
            saveLocale(l);
            start(() => router.refresh());
          }}
          className={cn("flex-1 rounded-md px-3 py-1 transition-colors", locale === l ? "bg-card font-medium shadow" : "text-muted-foreground hover:text-foreground")}
        >
          {NAMES[l]}
        </button>
      ))}
    </div>
  );
}

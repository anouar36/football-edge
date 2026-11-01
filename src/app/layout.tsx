import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Barlow_Condensed, IBM_Plex_Sans_Arabic, Manrope } from "next/font/google";
import "./globals.css";
import { dirOf } from "@/lib/i18n";
import { LocaleProvider } from "@/lib/i18n/client";
import { getT } from "@/lib/i18n/server";

// Self-hosted by Next.js (downloaded at build time, served from this site with long caching):
// no render-blocking request to Google Fonts, and size-adjusted fallbacks so text does not jump.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600", "700"], variable: "--font-plex-arabic", display: "swap" });
// Only the "EdgeXI" wordmark uses it.
const barlow = Barlow_Condensed({ subsets: ["latin"], weight: "600", variable: "--font-barlow", display: "swap", preload: false });

export function generateMetadata(): Metadata {
  const { t } = getT();
  return { title: t.meta.title, description: t.meta.description };
}

/** Wraps both route groups: (app) is the dashboard with the sidebar, (auth) the login page without it. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale } = getT();
  const theme = cookies().get("theme")?.value;
  const isDark = theme === "dark";
  const fonts = locale === "ar" ? "var(--font-plex-arabic),var(--font-manrope)" : "var(--font-manrope),var(--font-plex-arabic)";
  return (
    <html
      lang={locale}
      dir={dirOf(locale)}
      className={`${isDark ? "dark " : ""}${manrope.variable} ${plexArabic.variable} ${barlow.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");var d=document.documentElement;if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme:dark)").matches)){d.classList.add("dark")}else if(t==="light"){d.classList.remove("dark")}}catch(e){}})();`,
          }}
        />
        {/* As raw HTML: as a text child React escapes the quotes on the server only, and hydration fails on every page. */}
        <style dangerouslySetInnerHTML={{ __html: `:root{--font-sans:${fonts};--font-display:var(--font-barlow)}` }} />
      </head>
      <body className="min-h-screen lg:p-6">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}

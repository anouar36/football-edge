"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

export type Theme = "light" | "dark";

export function ThemeSwitch({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");
  const { locale } = useT();

  useEffect(() => {
    const isDark =
      document.documentElement.classList.contains("dark") ||
      localStorage.getItem("theme") === "dark" ||
      (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setTheme(isDark ? "dark" : "light");
  }, []);

  const toggle = (next: Theme) => {
    setTheme(next);
    const root = document.documentElement;
    if (next === "dark") {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
      document.cookie = "theme=dark; path=/; max-age=31536000; SameSite=Lax";
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
      document.cookie = "theme=light; path=/; max-age=31536000; SameSite=Lax";
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Theme mode"
      suppressHydrationWarning
      className={cn("flex gap-1 rounded-lg bg-secondary p-1 text-xs", className)}
    >
      <button
        type="button"
        role="radio"
        aria-checked={theme === "light"}
        onClick={() => toggle("light")}
        aria-label="Light mode"
        suppressHydrationWarning
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
          theme === "light"
            ? "bg-card font-medium text-foreground shadow"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Sun className="h-3.5 w-3.5 shrink-0" />
        <span>{locale === "ar" ? "فاتح" : "Light"}</span>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={theme === "dark"}
        onClick={() => toggle("dark")}
        aria-label="Dark mode"
        suppressHydrationWarning
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
          theme === "dark"
            ? "bg-card font-medium text-foreground shadow"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Moon className="h-3.5 w-3.5 shrink-0" />
        <span>{locale === "ar" ? "داكن" : "Dark"}</span>
      </button>
    </div>
  );
}

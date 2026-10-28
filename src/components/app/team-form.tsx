import { cn } from "@/lib/utils";
import type { FormOutcome } from "@/lib/data";

interface TeamFormProps {
  form?: FormOutcome[];
  size?: "sm" | "md";
  className?: string;
  labels?: { W?: string; D?: string; L?: string };
}

export function TeamForm({ form, size = "sm", className, labels }: TeamFormProps) {
  if (!form || form.length === 0) return null;

  const isMd = size === "md";

  return (
    <div
      className={cn("inline-flex items-center gap-1", className)}
      role="group"
      aria-label="Recent match form"
    >
      {form.map((outcome, idx) => {
        const title =
          outcome === "W"
            ? (labels?.W ?? "Win")
            : outcome === "D"
              ? (labels?.D ?? "Draw")
              : (labels?.L ?? "Loss");

        return (
          <span
            key={idx}
            title={title}
            aria-label={title}
            className={cn(
              "inline-flex items-center justify-center rounded-sm font-semibold select-none",
              isMd ? "h-5 w-5 text-[11px]" : "h-4 w-4 text-[9px]",
              outcome === "W" &&
                "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30",
              outcome === "D" &&
                "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30",
              outcome === "L" &&
                "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30"
            )}
          >
            {outcome}
          </span>
        );
      })}
    </div>
  );
}

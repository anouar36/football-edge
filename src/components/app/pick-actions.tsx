"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export function PickActions({
  id,
  status,
  compact,
  className,
}: {
  id: string;
  status: string;
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const { t } = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const set = (next: string) =>
    start(async () => {
      setError(null);
      const res = await fetch(`/api/picks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) setError(t.actions.error);
      router.refresh();
    });

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <Button
          size="sm"
          disabled={pending}
          onClick={() => set(status === "PLACED" ? "SUGGESTED" : "PLACED")}
          className={cn(
            "h-7 text-xs font-medium transition-all shadow-none",
            status === "PLACED"
              ? "bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
              : "border border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white"
          )}
        >
          {status === "PLACED" && <Check className="h-3 w-3" />}
          {status === "PLACED" ? t.actions.placed : t.actions.place}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => set(status === "SKIPPED" ? "SUGGESTED" : "SKIPPED")}
          className={cn(
            "h-7 text-xs transition-colors",
            status === "SKIPPED"
              ? "text-primary hover:bg-secondary gap-1"
              : "text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"
          )}
        >
          {status === "SKIPPED" && <Undo2 className="h-3 w-3" />}
          {status === "SKIPPED" ? t.actions.undo : t.actions.skip}
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <Button
        className={cn(
          "w-full font-medium transition-all",
          status === "PLACED"
            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
            : "bg-emerald-600 hover:bg-emerald-700 text-white"
        )}
        disabled={pending}
        onClick={() => set(status === "PLACED" ? "SUGGESTED" : "PLACED")}
      >
        {status === "PLACED" && <Check className="me-1.5 h-4 w-4" />}
        {status === "PLACED" ? t.actions.placedUndo : t.actions.markPlaced}
      </Button>
      <Button
        variant="outline"
        className={cn(
          "w-full text-muted-foreground hover:text-foreground",
          status === "SKIPPED" && "border-amber-500/40 text-amber-600"
        )}
        disabled={pending}
        onClick={() => set(status === "SKIPPED" ? "SUGGESTED" : "SKIPPED")}
      >
        {status === "SKIPPED" && <Undo2 className="me-1.5 h-4 w-4" />}
        {status === "SKIPPED" ? t.actions.skippedUndo : t.actions.skipBet}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

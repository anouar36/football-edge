"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export function PickActions({ id, status, compact, className }: { id: string; status: string; compact?: boolean; className?: string }) {
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
      <div className={cn("flex gap-1.5", className)}>
        <Button size="sm" variant={status === "PLACED" ? "default" : "outline"} disabled={pending} onClick={() => set(status === "PLACED" ? "SUGGESTED" : "PLACED")}>
          {status === "PLACED" ? t.actions.placed : t.actions.place}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => set(status === "SKIPPED" ? "SUGGESTED" : "SKIPPED")}>
          {status === "SKIPPED" ? t.actions.undo : t.actions.skip}
        </Button>
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <Button className="w-full" disabled={pending} onClick={() => set(status === "PLACED" ? "SUGGESTED" : "PLACED")}>
        {status === "PLACED" ? t.actions.placedUndo : t.actions.markPlaced}
      </Button>
      <Button variant="outline" className="w-full" disabled={pending} onClick={() => set(status === "SKIPPED" ? "SUGGESTED" : "SKIPPED")}>
        {status === "SKIPPED" ? t.actions.skippedUndo : t.actions.skipBet}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

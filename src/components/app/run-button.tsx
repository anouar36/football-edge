"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { ltr } from "@/lib/utils";

/** `ai` is the active provider's name, or null when its API key is missing. */
export function RunButton({ ai }: { ai: string | null }) {
  const router = useRouter();
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(ai ? t.run.working(ai) : t.run.workingNoAi);
          try {
            const res = await fetch("/api/run", { method: "POST" });
            // Not JSON when the platform stops the function (e.g. a 504 after 300 s).
            const j = await res.json().catch(() => ({}));
            setMsg(res.ok ? t.run.done(ltr(j.matches), ltr(j.picks)) : j.code === "RUN_IN_PROGRESS" ? t.run.inProgress : t.run.failed(j.error ?? String(res.status)));
            router.refresh();
          } catch {
            setMsg(t.run.network);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Play />}
        {t.run.button}
      </Button>
    </div>
  );
}

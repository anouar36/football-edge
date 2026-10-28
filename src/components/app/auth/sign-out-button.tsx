"use client";
import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Ends the session, then loads /login with a full page load (replace, not push),
 * so neither Next's client cache nor the Back button brings the dashboard back.
 */
export function SignOutButton({ iconOnly, className }: { iconOnly?: boolean; className?: string }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    const { error } = await authClient.signOut();
    if (error) return setBusy(false);
    window.location.replace("/login");
  };
  return (
    <Button
      variant="ghost"
      size={iconOnly ? "icon" : "sm"}
      onClick={signOut}
      disabled={busy}
      aria-label={iconOnly ? t.auth.signOut : undefined}
      title={iconOnly ? t.auth.signOut : undefined}
      className={cn(!iconOnly && "justify-start text-foreground/80", className)}
    >
      {busy ? <Loader2 className="animate-spin" /> : <LogOut className="rtl:-scale-x-100" />}
      {!iconOnly && t.auth.signOut}
    </Button>
  );
}

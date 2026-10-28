"use client";
import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/app/logo";
import { PasswordInput } from "@/components/app/auth/password-input";
import { authClient, authErrorKey } from "@/lib/auth/client";
import { useT } from "@/lib/i18n/client";

/**
 * Sign-in, or "Create your account" on the first run (no account yet). The server
 * refuses emails outside ALLOWED_EMAILS either way; this only shows its answer.
 */
export function LoginForm({ next, firstRun, noAllowedEmails }: { next: string; firstRun: boolean; noAllowedEmails: boolean }) {
  const { t } = useT();
  const [mode, setMode] = useState<"signIn" | "create">(firstRun ? "create" : "signIn");
  const [v, setV] = useState({ name: "", email: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = mode === "create";
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (create && v.password !== v.confirm) return setError(t.auth.errors.mismatch);
    setBusy(true);
    setError(null);
    const { error } = create
      ? await authClient.signUp.email({ name: v.name.trim(), email: v.email.trim(), password: v.password })
      : await authClient.signIn.email({ email: v.email.trim(), password: v.password });
    if (!error) return window.location.replace(next);
    const key = authErrorKey(error);
    // Someone created the first account meanwhile.
    if (key === "signUpClosed") setMode("signIn");
    setError(t.auth.errors[key]);
    setBusy(false);
  };

  return (
    <Card className="w-full max-w-[400px] shadow-float">
      <CardHeader className="items-center gap-3 px-6 pb-2 pt-8 text-center sm:px-8">
        <Logo className="text-[28px]" />
        <div className="flex flex-col gap-1.5 pt-2">
          <CardTitle className="text-xl">{create ? t.auth.createTitle : t.auth.signInTitle}</CardTitle>
          <CardDescription>{create ? t.auth.createDesc : t.auth.signInDesc}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-8 pt-4 sm:px-8">
        <form onSubmit={submit} className="flex flex-col gap-4">
          {noAllowedEmails && <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">{t.auth.noAllowedEmails}</p>}
          {create && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">{t.auth.name}</Label>
              <Input id="name" autoComplete="name" required maxLength={80} value={v.name} onChange={set("name")} className="h-10" />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{t.auth.email}</Label>
            <Input
              id="email"
              type="email"
              dir="ltr"
              autoComplete={create ? "email" : "username"}
              autoFocus={!create}
              required
              value={v.email}
              onChange={set("email")}
              placeholder="you@example.com"
              className="h-10 rtl:text-right"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">{t.auth.password}</Label>
            <PasswordInput
              id="password"
              autoComplete={create ? "new-password" : "current-password"}
              required
              minLength={create ? 8 : undefined}
              maxLength={128}
              value={v.password}
              onChange={set("password")}
              className="h-10"
            />
            {create && <p className="text-xs text-muted-foreground">{t.auth.passwordHint}</p>}
          </div>
          {create && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm">{t.auth.confirmPassword}</Label>
              <PasswordInput id="confirm" autoComplete="new-password" required maxLength={128} value={v.confirm} onChange={set("confirm")} className="h-10" />
            </div>
          )}
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={busy} className="w-full">
            {busy && <Loader2 className="animate-spin" />}
            {create ? (busy ? t.auth.creating : t.auth.create) : busy ? t.auth.signingIn : t.auth.signIn}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

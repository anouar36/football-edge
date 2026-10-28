"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Monitor, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/app/auth/password-input";
import { authClient, authErrorKey } from "@/lib/auth/client";
import { useT } from "@/lib/i18n/client";
import { cn, ltr } from "@/lib/utils";

/* Client parts of the Security card (security-card.tsx loads the data). */

type Status = { busy: boolean; msg: string | null; error: boolean };
const idle: Status = { busy: false, msg: null, error: false };

function StatusText({ s }: { s: Status }) {
  if (!s.msg) return null;
  return (
    <span role={s.error ? "alert" : "status"} className={cn("text-sm", s.error ? "text-destructive" : "text-muted-foreground")}>
      {s.msg}
    </span>
  );
}

export function ChangePasswordForm({ email }: { email: string }) {
  const { t } = useT();
  const router = useRouter();
  const [v, setV] = useState({ current: "", next: "", confirm: "" });
  const [s, setS] = useState<Status>(idle);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (v.next !== v.confirm) return setS({ busy: false, msg: t.auth.errors.mismatch, error: true });
    setS({ busy: true, msg: null, error: false });
    // Signs out every other device; this one gets a new session.
    const { error } = await authClient.changePassword({ currentPassword: v.current, newPassword: v.next, revokeOtherSessions: true });
    if (error) return setS({ busy: false, msg: t.auth.errors[authErrorKey(error)], error: true });
    setV({ current: "", next: "", confirm: "" });
    setS({ busy: false, msg: t.security.changed, error: false });
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold">{t.security.changePassword}</h3>
      {/* Lets password managers file the new password under the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currentPassword">{t.security.currentPassword}</Label>
        <PasswordInput id="currentPassword" autoComplete="current-password" required maxLength={128} value={v.current} onChange={set("current")} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newPassword">{t.security.newPassword}</Label>
        <PasswordInput id="newPassword" autoComplete="new-password" required minLength={8} maxLength={128} value={v.next} onChange={set("next")} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">{t.security.confirmPassword}</Label>
        <PasswordInput id="confirmPassword" autoComplete="new-password" required maxLength={128} value={v.confirm} onChange={set("confirm")} />
        <p className="text-xs text-muted-foreground">{t.security.changePasswordHint}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={s.busy}>
          {s.busy && <Loader2 className="animate-spin" />}
          {s.busy ? t.security.saving : t.security.changePassword}
        </Button>
        <StatusText s={s} />
      </div>
    </form>
  );
}

export type SessionRow = { id: string; current: boolean; device: string; mobile: boolean; ip: string | null; lastActive: string };

export function Sessions({ sessions }: { sessions: SessionRow[] }) {
  const { t } = useT();
  const router = useRouter();
  const [s, setS] = useState<Status>(idle);
  const others = sessions.filter((x) => !x.current).length;

  const signOutOthers = async () => {
    setS({ busy: true, msg: null, error: false });
    const { error } = await authClient.revokeOtherSessions();
    setS(error ? { busy: false, msg: t.auth.errors[authErrorKey(error)], error: true } : { busy: false, msg: t.security.othersSignedOut, error: false });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold">{t.security.sessions}</h3>
      <ul className="divide-y rounded-lg border">
        {sessions.map((x) => {
          const Icon = x.mobile ? Smartphone : Monitor;
          return (
            <li key={x.id} className="flex items-center gap-3 px-3 py-2.5">
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <bdi>{x.device}</bdi>
                  {x.current && <Badge variant="success">{t.security.thisDevice}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {x.ip && (
                    <>
                      <bdi dir="ltr" className="num">{x.ip}</bdi> ·{" "}
                    </>
                  )}
                  {t.security.lastActive(x.lastActive)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={s.busy || others === 0} onClick={signOutOthers}>
          {s.busy && <Loader2 className="animate-spin" />}
          {s.busy ? t.security.signingOutOthers : t.security.signOutOthers}
        </Button>
        {others === 0 && !s.msg ? <span className="text-xs text-muted-foreground">{t.security.noOtherSessions}</span> : <StatusText s={s} />}
      </div>
    </div>
  );
}

export function People({ people, me }: { people: { email: string; name: string | null }[]; me: string }) {
  const { t } = useT();
  const router = useRouter();
  const addable = people.filter((p) => p.name === null).map((p) => p.email);
  const [v, setV] = useState({ email: addable[0] ?? "", name: "", password: "" });
  const [s, setS] = useState<Status>(idle);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setS({ busy: true, msg: null, error: false });
    // The "add-user" endpoint in src/lib/auth/server.ts.
    const { error } = await authClient.$fetch("/add-user", { method: "POST", body: v });
    if (error) return setS({ busy: false, msg: t.auth.errors[authErrorKey(error)], error: true });
    const rest = addable.filter((x) => x !== v.email);
    setV({ email: rest[0] ?? "", name: "", password: "" });
    setS({ busy: false, msg: t.security.added(ltr(v.email)), error: false });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">{t.security.people}</h3>
        <p className="text-xs text-muted-foreground">{t.security.peopleHint}</p>
      </div>
      <ul className="divide-y rounded-lg border">
        {people.map((p) => (
          <li key={p.email} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
            <span className={cn("font-medium", p.name === null && "font-normal text-muted-foreground")}>{p.name ?? t.security.noAccount}</span>
            <span className="flex items-center gap-2">
              {p.email === me.toLowerCase() && <Badge variant="secondary">{t.security.you}</Badge>}
              <bdi dir="ltr" className="text-muted-foreground">{p.email}</bdi>
            </span>
          </li>
        ))}
      </ul>
      {addable.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t.security.allHaveAccounts}</p>
      ) : (
        <form onSubmit={add} className="flex flex-col gap-4 rounded-lg border p-4">
          <div className="flex flex-col gap-1">
            <h4 className="text-sm font-medium">{t.security.addPerson}</h4>
            <p className="text-xs text-muted-foreground">{t.security.addPersonHint}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="addEmail">{t.auth.email}</Label>
              <select
                id="addEmail"
                dir="ltr"
                value={v.email}
                onChange={(e) => setV({ ...v, email: e.target.value })}
                className="h-9 rounded-md border border-input bg-card px-2 text-sm shadow-sm"
              >
                {addable.map((email) => (
                  <option key={email} value={email}>{email}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="addName">{t.auth.name}</Label>
              <Input id="addName" autoComplete="off" required maxLength={80} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="addPassword">{t.security.tempPassword}</Label>
              <PasswordInput id="addPassword" autoComplete="new-password" required minLength={8} maxLength={128} value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={s.busy}>
              {s.busy && <Loader2 className="animate-spin" />}
              {s.busy ? t.security.adding : t.security.add}
            </Button>
            <StatusText s={s} />
          </div>
        </form>
      )}
      {addable.length === 0 && s.msg && <StatusText s={s} />}
    </div>
  );
}

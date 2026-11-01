"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertCircle, Check, ExternalLink, RefreshCw, Send } from "lucide-react";
import { LEAGUES } from "@/lib/data/leagues";
import type { Dictionary } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { PROVIDER_IDS, type ProviderId } from "@/lib/llm/types";
import type { SettingsInput } from "@/lib/settings-schema";
import { cn } from "@/lib/utils";

type FieldName = keyof Dictionary["settings"]["fields"];
type Field = { name: FieldName; pctField?: boolean; step?: string };

const STAKING: Field[] = [
  { name: "bankroll", step: "1" },
  { name: "currency" },
  { name: "kellyFraction", step: "0.05" },
  { name: "maxStakePct", pctField: true, step: "0.5" },
];
const FILTERS: Field[] = [
  { name: "minEdge", pctField: true, step: "0.5" },
  { name: "minProb", pctField: true, step: "1" },
  { name: "minOdds", step: "0.05" },
  { name: "maxOdds", step: "0.1" },
  { name: "maxPicksPerDay", step: "1" },
  { name: "modelWeight", step: "0.05" },
  { name: "daysAhead", step: "1" },
];

/** Key status per provider, from providerStatus() on the server. Never holds key values. */
export type ProviderOptions = Record<ProviderId, { name: string; keyEnv: string; keySet: boolean; defaultModel: string }>;

export type TelegramBotInfo = {
  isConfigured: boolean;
  username: string;
};

export function SettingsForm({
  initial,
  providers,
  telegramBot = { isConfigured: false, username: "football_edge_bot" },
}: {
  initial: SettingsInput;
  providers: ProviderOptions;
  telegramBot?: TelegramBotInfo;
}) {
  const router = useRouter();
  const { t, locale } = useT();
  const [v, setV] = useState<SettingsInput>(initial);
  const [state, setState] = useState<{ saving: boolean; msg: string | null; error: boolean }>({ saving: false, msg: null, error: false });
  const [tgDetecting, setTgDetecting] = useState(false);
  const [tgTesting, setTgTesting] = useState(false);
  const [tgMsg, setTgMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const leagues = new Set(v.leagues.split(",").filter(Boolean));
  const provider = providers[v.llmProvider];

  const field = (f: Field) => {
    const raw = v[f.name] as number | string;
    const shown = f.pctField ? Math.round(Number(raw) * 1000) / 10 : raw;
    const { label, hint } = t.settings.fields[f.name];
    return (
      <div key={f.name} className="flex flex-col gap-1.5">
        <Label htmlFor={f.name}>{label}{f.pctField ? " (%)" : ""}</Label>
        <Input
          id={f.name}
          type={f.name === "currency" ? "text" : "number"}
          step={f.step}
          value={String(shown)}
          onChange={(e) => {
            const val = f.name === "currency" ? e.target.value : f.pctField ? Number(e.target.value) / 100 : Number(e.target.value);
            setV({ ...v, [f.name]: val });
          }}
        />
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    );
  };

  /** The API answers with a code or the field name, so the message is shown in the interface language. */
  const errorMessage = (j: { code?: string; field?: string }) => {
    if (j.code === "ODDS_RANGE") return t.settings.oddsRange;
    if (j.field === "llmModel") return t.settings.invalidField(t.settings.model);
    if (j.field === "displayName") return t.settings.invalidField(t.tickets.settings.displayName);
    if (j.field && j.field in t.settings.fields) return t.settings.invalidField(t.settings.fields[j.field as FieldName].label);
    return t.settings.saveFailed;
  };

  const save = async () => {
    setState({ saving: true, msg: null, error: false });
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
    const j = await res.json().catch(() => ({}));
    setState({ saving: false, msg: res.ok ? t.settings.saved : errorMessage(j), error: !res.ok });
    router.refresh();
  };

  const detectChatId = async () => {
    setTgDetecting(true);
    setTgMsg(null);
    try {
      const res = await fetch("/api/telegram/chats");
      const data = await res.json();
      if (!res.ok) {
        setTgMsg({ text: data.error || "Failed to query Telegram", error: true });
        return;
      }
      if (data.chats && data.chats.length > 0) {
        const top = data.chats[0];
        setV((prev) => ({ ...prev, telegramChatId: top.id }));
        setTgMsg({
          text: `${t.settings.telegram.detectedSuccess(top.id)} (${top.name})`,
          error: false,
        });
      } else {
        setTgMsg({
          text: t.settings.telegram.noChatsFound(telegramBot.username),
          error: true,
        });
      }
    } catch {
      setTgMsg({ text: "Network error detecting chat", error: true });
    } finally {
      setTgDetecting(false);
    }
  };

  const sendTestAlert = async () => {
    if (!v.telegramChatId) return;
    setTgTesting(true);
    setTgMsg(null);
    try {
      const res = await fetch("/api/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: v.telegramChatId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTgMsg({ text: t.settings.telegram.testFailed(data.error || "Unknown"), error: true });
      } else {
        setTgMsg({ text: t.settings.telegram.testSuccess, error: false });
      }
    } catch {
      setTgMsg({ text: t.settings.telegram.testFailed("Network error"), error: true });
    } finally {
      setTgTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.staking}</CardTitle>
          <CardDescription>{t.settings.stakingDesc}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">{STAKING.map(field)}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.tickets.settings.title}</CardTitle>
          <CardDescription>{t.tickets.settings.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="displayName">{t.tickets.settings.displayName}</Label>
            <Input id="displayName" dir="auto" maxLength={40} value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.filters}</CardTitle>
          <CardDescription>{t.settings.filtersDesc}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{FILTERS.map(field)}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.leagues}</CardTitle>
          <CardDescription>{t.settings.leaguesDesc}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(LEAGUES).map(([code, l]) => {
            const on = leagues.has(code);
            const name = locale === "ar" ? l.ar : l;
            return (
              <button
                key={code}
                type="button"
                onClick={() => {
                  const next = new Set(leagues);
                  if (on) next.delete(code);
                  else next.add(code);
                  setV({ ...v, leagues: Array.from(next).join(",") });
                }}
                className={cn("rounded-lg border px-3 py-2 text-start text-sm transition-colors", on ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-secondary")}
              >
                <div className="font-medium">{name.name}</div>
                <div className={cn("text-[11px]", on ? "text-background/70" : "text-muted-foreground")}>{name.country} · {code}</div>
              </button>
            );
          })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.aiAnalyst}</CardTitle>
          <CardDescription>{t.settings.aiDesc}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label id="llmProvider-label">{t.settings.provider}</Label>
            <div role="radiogroup" aria-labelledby="llmProvider-label" className="grid gap-2 sm:grid-cols-3">
              {PROVIDER_IDS.map((id) => {
                const p = providers[id];
                const on = v.llmProvider === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    // A model id belongs to one provider, so switching goes back to the new provider's default.
                    onClick={() => !on && setV({ ...v, llmProvider: id, llmModel: null })}
                    className={cn(
                      "flex flex-col items-start gap-1.5 rounded-lg border px-3 py-2.5 text-start text-sm transition-colors",
                      on ? "border-foreground bg-secondary ring-1 ring-foreground" : "bg-card hover:bg-secondary"
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="font-medium">{p.name}</span>
                      <Badge variant={p.keySet ? "success" : "destructive"}>{p.keySet ? t.settings.keySet : t.settings.keyMissing}</Badge>
                    </span>
                    <span dir="ltr" className="text-[11px] text-muted-foreground">{p.keyEnv}</span>
                  </button>
                );
              })}
            </div>
            {!provider.keySet && (
              <p className="mt-1 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">{t.settings.noKeyWarning(provider.name, provider.keyEnv)}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="llmModel">{t.settings.model}</Label>
            <Input
              id="llmModel"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              placeholder={provider.defaultModel}
              value={v.llmModel ?? ""}
              onChange={(e) => setV({ ...v, llmModel: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">{t.settings.modelHint(provider.defaultModel)}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="language">{t.settings.analysisLanguage}</Label>
            <select
              id="language"
              value={v.language}
              onChange={(e) => setV({ ...v, language: e.target.value as SettingsInput["language"] })}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm shadow-sm"
            >
              <option value="ar">العربية</option>
              <option value="darija">الدارجة المغربية</option>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
            <p className="text-xs text-muted-foreground">{t.settings.analysisLanguageHint}</p>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
            <div>
              <Label htmlFor="useWebSearch">{t.settings.webSearch}</Label>
              <p className="mt-1 text-xs text-muted-foreground">{t.settings.webSearchHint}</p>
            </div>
            <Switch id="useWebSearch" checked={v.useWebSearch} onCheckedChange={(c) => setV({ ...v, useWebSearch: c })} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>{t.settings.telegram.title}</CardTitle>
            <CardDescription className="mt-1.5">{t.settings.telegram.description}</CardDescription>
          </div>
          <Badge variant={telegramBot.isConfigured ? "success" : "destructive"}>
            {telegramBot.isConfigured
              ? t.settings.telegram.botConnected(telegramBot.username)
              : t.settings.telegram.botMissing}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="telegramAlerts">{t.settings.telegram.enable}</Label>
              <p className="mt-1 text-xs text-muted-foreground">{t.settings.telegram.enableHint}</p>
            </div>
            <Switch
              id="telegramAlerts"
              checked={v.telegramAlerts}
              onCheckedChange={(c) => setV({ ...v, telegramAlerts: c })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="telegramChatId">{t.settings.telegram.chatId}</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                id="telegramChatId"
                dir="ltr"
                placeholder="e.g. 123456789"
                value={v.telegramChatId ?? ""}
                onChange={(e) => setV({ ...v, telegramChatId: e.target.value })}
                className="font-mono text-sm"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={detectChatId}
                  disabled={tgDetecting || !telegramBot.isConfigured}
                  className="whitespace-nowrap"
                >
                  <RefreshCw className={cn("me-1.5 h-3.5 w-3.5", tgDetecting && "animate-spin")} />
                  {tgDetecting ? t.settings.telegram.detecting : t.settings.telegram.detectChatId}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={sendTestAlert}
                  disabled={tgTesting || !v.telegramChatId || !telegramBot.isConfigured}
                  className="whitespace-nowrap"
                >
                  <Send className={cn("me-1.5 h-3.5 w-3.5", tgTesting && "animate-pulse")} />
                  {tgTesting ? t.settings.telegram.sendingTest : t.settings.telegram.sendTest}
                </Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground flex items-center justify-between gap-2 flex-wrap">
              <span>{t.settings.telegram.chatIdHint}</span>
              <a
                href={`https://t.me/${telegramBot.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-primary hover:underline font-medium"
              >
                {t.settings.telegram.openBot(telegramBot.username)}
                <ExternalLink className="ms-1 h-3 w-3" />
              </a>
            </div>
            {tgMsg && (
              <div
                className={cn(
                  "rounded-md px-3 py-2 text-xs flex items-center gap-2",
                  tgMsg.error ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"
                )}
              >
                {tgMsg.error ? <AlertCircle className="h-4 w-4 shrink-0" /> : <Check className="h-4 w-4 shrink-0" />}
                <span>{tgMsg.text}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={state.saving}>{state.saving ? t.settings.saving : t.settings.save}</Button>
        {state.msg && <span className={cn("text-sm", state.error ? "text-destructive" : "text-muted-foreground")}>{state.msg}</span>}
      </div>
    </div>
  );
}

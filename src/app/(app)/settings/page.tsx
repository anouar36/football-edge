import { Suspense } from "react";
import { cachedSettings } from "@/lib/data";
import { activeProvider, providerStatus, type ProviderId } from "@/lib/llm";
import { getT } from "@/lib/i18n/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KV, PageHeader } from "@/components/app/bits";
import { LanguageSwitch } from "@/components/app/language-switch";
import { SettingsForm } from "@/components/app/settings-form";
import { RunButton } from "@/components/app/run-button";
import { SecurityCard } from "@/components/app/auth/security-card";
import { BankrollWarning } from "@/components/app/bankroll-warning";
import { CardSkeleton } from "@/components/app/skeletons";
import { allowedEmails } from "@/lib/auth/allowlist";

export default async function SettingsPage() {
  const { t } = getT();
  const s = await cachedSettings();
  const { id: _id, updatedAt: _u, ...initial } = s;
  const ai = activeProvider(s);
  const allowed = allowedEmails();
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <PageHeader title={t.settings.title} right={<RunButton ai={ai.keySet ? ai.name : null} />} />
      <BankrollWarning settings={s} showLink={false} />
      <Card>
        <CardContent className="grid gap-x-10 p-5 sm:grid-cols-2">
          <KV k={t.settings.aiAnalyst} v={<bdi>{ai.name} · {ai.model}</bdi>} />
          <KV k={<>{t.settings.apiKey} <bdi className="text-xs">({ai.keyEnv})</bdi></>} v={<Badge variant={ai.keySet ? "success" : "destructive"}>{ai.keySet ? t.settings.keySet : t.settings.keyMissing}</Badge>} />
          <KV k={t.settings.dailyJob} v={t.settings.dailyJobValue} />
          <KV
            k={<>{t.settings.allowedEmails} <bdi className="text-xs">(ALLOWED_EMAILS)</bdi></>}
            v={
              allowed.length ? (
                <span className="flex flex-wrap justify-end gap-x-2">
                  {allowed.map((email) => (
                    <bdi key={email} dir="ltr">{email}</bdi>
                  ))}
                </span>
              ) : (
                <Badge variant="destructive">{t.settings.noAllowedEmails}</Badge>
              )
            }
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div className="flex flex-col gap-1.5">
            <CardTitle>{t.language.label}</CardTitle>
            <CardDescription>{t.language.hint}</CardDescription>
          </div>
          <LanguageSwitch className="w-56" />
        </CardHeader>
      </Card>
      <SettingsForm
        initial={{ ...initial, language: initial.language as "ar" | "darija" | "fr" | "en", llmProvider: ai.id as ProviderId }}
        providers={providerStatus()}
      />
      {/* Per-user and read from the database (sessions, people): never cached, streamed after the form. */}
      <Suspense fallback={<CardSkeleton lines={6} />}>
        <SecurityCard />
      </Suspense>
    </div>
  );
}

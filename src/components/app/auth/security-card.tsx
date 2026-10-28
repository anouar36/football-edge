import { headers } from "next/headers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuth, getSession, peopleWithAccess } from "@/lib/auth/server";
import { getT } from "@/lib/i18n/server";
import { fmtDate, fmtTime, ltr } from "@/lib/utils";
import { ChangePasswordForm, People, Sessions, type SessionRow } from "./security-forms";

/** "Chrome · macOS" from a user agent, or null when nothing is recognised. */
function describeDevice(ua: string | null | undefined) {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /^curl\//.test(ua) ? "curl" : null;
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : null;
  return [browser, os].filter(Boolean).join(" · ") || null;
}

/** Better Auth stores IPv6 expanded ("2a01:0e0a:0000:..."); shown compressed ("2a01:e0a::"). */
function shortIp(ip: string | null | undefined) {
  if (!ip?.includes(":")) return ip ?? null;
  const groups = ip.split(":").map((g) => g.replace(/^0+(?=.)/, ""));
  let best = { at: -1, len: 1 };
  for (let i = 0; i < groups.length; i++) {
    let len = 0;
    while (groups[i + len] === "0") len++;
    if (len > best.len) best = { at: i, len };
  }
  if (best.at < 0) return groups.join(":");
  return `${groups.slice(0, best.at).join(":")}::${groups.slice(best.at + best.len).join(":")}`;
}

/** Settings → Security: change password, the signed-in devices, and who has access. */
export async function SecurityCard() {
  const { t, locale } = getT();
  const session = await getSession();
  if (!session) return null;
  const [list, people] = await Promise.all([(await getAuth()).api.listSessions({ headers: headers() }), peopleWithAccess()]);
  const sessions: SessionRow[] = list
    .map((s) => ({
      id: s.id,
      current: s.id === session.session.id,
      device: describeDevice(s.userAgent) ?? t.security.unknownDevice,
      mobile: /Mobile|iPhone|Android/.test(s.userAgent ?? ""),
      ip: shortIp(s.ipAddress),
      updatedAt: new Date(s.updatedAt),
    }))
    // This device first, then the most recently active.
    .sort((a, b) => Number(b.current) - Number(a.current) || b.updatedAt.getTime() - a.updatedAt.getTime())
    .map(({ updatedAt, ...s }) => ({ ...s, lastActive: t.common.dateTime(fmtDate(updatedAt, locale), fmtTime(updatedAt)) }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.security.title}</CardTitle>
        <CardDescription>
          {t.security.description} {t.security.signedInAs(ltr(session.user.email))}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <ChangePasswordForm email={session.user.email} />
        <Sessions sessions={sessions} />
        <div className="lg:col-span-2">
          <People people={people} me={session.user.email} />
        </div>
      </CardContent>
    </Card>
  );
}

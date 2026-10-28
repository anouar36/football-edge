import Link from "next/link";
import { allLogos, cachedSettings, finishedMatches, getTeamForms, upcomingMatches } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/app/bits";
import { Pager, pageOf } from "@/components/app/pager";
import { MatchesView } from "@/components/app/matches-view";

export default async function MatchesPage({ searchParams }: { searchParams: { past?: string; page?: string } }) {
  const { t, locale } = getT();
  const past = searchParams.past === "1";
  const page = pageOf(searchParams.page);
  const [list, logoPairs, settings, teamForms] = await Promise.all([
    past ? finishedMatches(page) : upcomingMatches().then((rows) => ({ rows, total: rows.length })),
    allLogos().catch(() => ({ teams: [], leagues: [] })),
    cachedSettings(),
    getTeamForms(),
  ]);

  const logoMap = {
    teams: Object.fromEntries(logoPairs.teams),
    leagues: Object.fromEntries(logoPairs.leagues),
  };

  const matches = list.rows;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.matches.title}
        sub={t.matches.sub}
        right={
          <div className="flex gap-1 rounded-lg bg-secondary p-1 text-sm">
            <Link
              href="/matches"
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                !past ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.matches.upcoming}
            </Link>
            <Link
              href="/matches?past=1"
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                past ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.matches.finished}
            </Link>
          </div>
        }
      />
      <Card>
        <CardContent className="p-3 sm:p-5">
          <MatchesView
            matches={matches}
            logoMap={logoMap}
            settings={settings}
            teamForms={teamForms}
            past={past}
          />
          {past && (
            <div className="mt-4 border-t pt-4">
              <Pager page={page} total={list.total} href={(n) => `/matches?past=1${n > 1 ? `&page=${n}` : ""}`} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

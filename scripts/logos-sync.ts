import "./env";
/**
 * Fills the logo cache for every team in the enabled leagues, then prints how many
 * teams have a logo per league and which do not (add those to src/lib/data/team-aliases.ts).
 *   npm run logos:sync              teams not searched yet (misses are retried after 30 days)
 *   npm run logos:sync -- --retry   also search again the teams that had no logo
 */
import { and, inArray } from "drizzle-orm";
import { closeDb, getReadyDb, getSettings } from "../src/lib/db";
import { leagueLogos, matches, teamLogos } from "../src/lib/schema";
import { fetchFixtures, fetchSeason, seasonCode } from "../src/lib/data/footballdata";
import { LOGO_LEAGUES, syncLogos } from "../src/lib/data/logos";
import { LEAGUES } from "../src/lib/data/leagues";
import { invalidate, TAG } from "../src/lib/cache";

(async () => {
  try {
    const settings = await getSettings();
    const leagues = settings.leagues.split(",").map((s) => s.trim()).filter((l) => LOGO_LEAGUES[l]);
    const now = new Date();
    const teams = new Map(leagues.map((l) => [l, new Set<string>()]));
    const add = (league: string, name: string) => teams.get(league)?.add(name);

    // This season's clubs (last season's before it starts), upcoming fixtures, and every stored match.
    for (const league of leagues) {
      let season = await fetchSeason(league, seasonCode(now));
      if (!season.length) season = await fetchSeason(league, seasonCode(now, -1));
      for (const m of season) {
        add(league, m.home);
        add(league, m.away);
      }
    }
    for (const f of await fetchFixtures(leagues).catch(() => [])) {
      add(f.league, f.home);
      add(f.league, f.away);
    }
    const db = await getReadyDb();
    for (const m of await db.select({ league: matches.league, home: matches.home, away: matches.away }).from(matches).where(inArray(matches.league, leagues))) {
      add(m.league, m.home);
      add(m.league, m.away);
    }

    const list = Array.from(teams, ([league, names]) => Array.from(names, (name) => ({ name, league }))).flat();
    const retry = process.argv.includes("--retry");
    console.log(`${list.length} teams in ${leagues.join(", ")}${retry ? " (retrying misses)" : ""}`);

    const r = await syncLogos({ teams: list, leagues }, { retryMissing: retry, progress: (line) => console.log(`  ${line}`) });
    console.log(`\nsource ${r.source}: ${r.searched} searched, ${r.found.length} found, ${r.reused} reused from another league`);
    if (r.errors.length) console.log(`errors: ${r.errors.slice(0, 5).join(" | ")}`);
    if (r.stopped) console.log(`stopped early: ${r.stopped}. Run it again later to continue.`);
    // The pages read logos from a cache kept a day: clear it on the deployed app (needs APP_URL + CRON_SECRET).
    await invalidate(TAG.logos);

    // Report from the cache, so teams found in earlier runs count too.
    const rows = await db.select().from(teamLogos).where(and(inArray(teamLogos.name, list.map((t) => t.name)), inArray(teamLogos.league, leagues)));
    const logo = new Map(rows.map((x) => [`${x.name}|${x.league}`, x.logoUrl]));
    const haveLeague = new Set((await db.select().from(leagueLogos).where(inArray(leagueLogos.code, leagues))).map((x) => x.code));
    console.log("\nleague                         logos   without a logo");
    for (const [league, names] of teams) {
      const all = Array.from(names).sort();
      const missing = all.filter((n) => !logo.get(`${n}|${league}`));
      const pending = missing.filter((n) => !logo.has(`${n}|${league}`)).length;
      const label = `${league.padEnd(4)} ${LEAGUES[league].name}${haveLeague.has(league) ? "" : " (no league logo)"}`;
      console.log(
        `${label.padEnd(30)} ${`${all.length - missing.length}/${all.length}`.padEnd(7)} ${missing.join(", ")}${pending ? ` (${pending} not searched yet)` : ""}`
      );
    }
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
})();

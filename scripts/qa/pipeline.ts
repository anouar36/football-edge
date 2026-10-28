import "../env";
/**
 * The daily pipeline against a real Postgres, with fake outside services.
 * Wipes the app tables first, so it only runs on a local database (QA_ALLOW_REMOTE_DB=1 to override,
 * e.g. for a Neon branch). Never point it at production.
 *   npm run qa:pipeline
 */
import { spawnSync } from "node:child_process";
import { check, done, near, section } from "./harness";
import { fakeAnthropic, fakeFootballData } from "./fakes";
import { synthLeague } from "../synthetic";
import { describeDb, pgConfig } from "../../src/lib/db-config";

const db = pgConfig();
const local = ["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(db.host);
if (!local && process.env.QA_ALLOW_REMOTE_DB !== "1") {
  console.error(`Refusing to wipe ${describeDb(db)}: not a local database. Set QA_ALLOW_REMOTE_DB=1 for a Neon branch (never production).`);
  process.exit(1);
}

const STEP_TIMEOUT = 90_000;
/** Resolves to "timeout" instead of hanging the test when the code under test never settles. */
const within = <T,>(p: Promise<T>, ms = STEP_TIMEOUT) => Promise.race([p, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms))]);

(async () => {
  console.log(`database: ${describeDb(db)}`);
  const csv = await fakeFootballData();
  const ai = await fakeAnthropic();
  // Read when the modules below are first loaded: point them at the fakes.
  process.env.FOOTBALL_DATA_BASE_URL = csv.url;
  process.env.ANTHROPIC_BASE_URL = ai.url;
  process.env.ANTHROPIC_API_KEY = "qa-fake-key";
  const { getDb, getReadyDb, closeDb } = await import("../../src/lib/db");
  const { runDaily } = await import("../../src/lib/pipeline/daily");
  const { runSettle } = await import("../../src/lib/pipeline/settle");
  const { fetchFixtures } = await import("../../src/lib/data/footballdata");
  const { settleKey } = await import("../../src/lib/model/value");
  const schema = await import("../../src/lib/schema");
  const { sql, eq, inArray } = await import("drizzle-orm");

  await getReadyDb();
  const d = getDb();
  const reset = async () => {
    await d.execute(sql`truncate ticket_legs, tickets, picks, matches, runs, settings restart identity cascade`);
    // Looser filters than the defaults so the synthetic day gives several picks to settle.
    await d.insert(schema.settings).values({ id: 1, leagues: "E0", bankroll: 1000, minEdge: 0.01, minProb: 0.2 });
  };
  const bankroll = async () => (await d.select().from(schema.settings).where(eq(schema.settings.id, 1)))[0].bankroll;

  const L = synthLeague({ seasons: 2, seed: 11 });
  const D = new Date(L.history[L.history.length - 1].kickoff.getTime() + 2 * 86_400_000);
  D.setUTCHours(8, 0, 0, 0);
  const fixtures = L.fixtures(D, 10);
  const results = fixtures.map(L.play);
  const history = { E0: L.history };
  const daily = (extra: Record<string, unknown> = {}) => runDaily({ now: D, fixtures, history, skipLogos: true, skipReview: true, ...extra });
  const settleAt = new Date(D.getTime() + 2 * 86_400_000);

  // ---------- A. daily twice, settle twice ----------
  section("A. Daily twice, then settle twice: idempotent, bankroll counted once");
  await reset();
  const r1 = await daily();
  const r2 = await daily();
  const picks1 = await d.select().from(schema.picks);
  check("second daily run gives the same matches and picks", r1.matches === r2.matches && r1.picks === r2.picks, `${r1.matches} matches, ${r1.picks} picks`);
  check("no duplicate picks (one row per match and market)", new Set(picks1.map((p) => `${p.matchId}|${p.key}`)).size === picks1.length && picks1.length === r2.picks);
  check("stakes respect the 2% cap and are positive", picks1.every((p) => p.stake > 0 && p.stake <= 20 + 1e-9), picks1.map((p) => p.stake).join(", "));
  const placed = picks1.filter((_, i) => i % 2 === 0);
  if (placed.length) await d.update(schema.picks).set({ status: "PLACED" }).where(inArray(schema.picks.id, placed.map((p) => p.id)));
  // A ticket over the first two picked matches, settled with the picks.
  const legsFor = picks1.slice(0, 2);
  await d.insert(schema.tickets).values({ id: "qa-ticket", stake: 10, totalOdds: legsFor.reduce((a, p) => a * p.odds, 1), prob: 0.2, ev: 0.05 });
  await d.insert(schema.ticketLegs).values(legsFor.map((p, i) => ({ id: `qa-leg-${i}`, ticketId: "qa-ticket", matchId: p.matchId, key: p.key, label: p.label, odds: p.odds, prob: p.prob })));

  const before = await bankroll();
  const s1 = await runSettle({ now: settleAt, results });
  const after1 = await bankroll();
  const s2 = await runSettle({ now: settleAt, results });
  const after2 = await bankroll();
  const settledPicks = await d.select().from(schema.picks);
  const resultOf = (matchId: string) => {
    const m = fixtures.find((f) => `${f.league}-${f.kickoff.toISOString().slice(0, 10)}-${f.home}-${f.away}`.replace(/\s+/g, "_") === matchId)!;
    return results[fixtures.indexOf(m)];
  };
  let expected = 0;
  let profitsOk = true;
  for (const p of settledPicks) {
    const r = resultOf(p.matchId);
    const res = settleKey(p.key, r.hg, r.ag, r.hc, r.ac);
    const profit = res === "WON" ? p.stake * (p.odds - 1) : res === "LOST" ? -p.stake : 0;
    if (p.result !== res || !near(p.profit ?? NaN, Math.round(profit * 100) / 100, 1e-9)) profitsOk = false;
    if (p.status === "PLACED") expected += profit;
    const close = r.closing[p.key];
    if (close && !near(p.clv ?? NaN, p.odds / close - 1, 1e-12)) profitsOk = false;
  }
  check("first settle settles every pick, second settles none", s1.settled === picks1.length && s2.settled === 0, `${s1.settled} then ${s2.settled}`);
  check("each pick: result, profit and CLV match an independent calculation", profitsOk);
  check("bankroll moves once, by the profit of PLACED picks only", near(after1 - before, Math.round(expected * 100) / 100, 0.011) && after2 === after1, `${before} → ${after1} → ${after2}, expected ${expected >= 0 ? "+" : ""}${expected.toFixed(2)}`);
  const [ticket] = await d.select().from(schema.tickets).where(eq(schema.tickets.id, "qa-ticket"));
  const legResults = legsFor.map((p) => settleKey(p.key, resultOf(p.matchId).hg, resultOf(p.matchId).ag));
  const ticketWant = legResults.includes("LOST") ? -10 : legResults.every((x) => x === "VOID") ? 0 : 10 * (legsFor.reduce((a, p, i) => a * (legResults[i] === "WON" ? p.odds : 1), 1) - 1);
  check("ticket settled once with the right profit", ticket.status !== "PENDING" && near(ticket.profit ?? NaN, Math.round(ticketWant * 100) / 100, 1e-9) && s2.ticketsSettled === 0, `${ticket.status} ${ticket.profit} (want ${ticketWant.toFixed(2)})`);
  const r3 = await daily();
  const kept = await d.select().from(schema.picks);
  check("a daily run after settlement keeps settled and placed picks", kept.filter((p) => p.result !== "PENDING").length === picks1.length, `${r3.picks} picks`);

  // ---------- B. two settles at once ----------
  section("B. Two settles at the same time");
  await reset();
  await daily();
  const all = await d.select().from(schema.picks);
  await d.update(schema.picks).set({ status: "PLACED" });
  const b0 = await bankroll();
  const [c1, c2] = await Promise.all([runSettle({ now: settleAt, results }), runSettle({ now: settleAt, results })]);
  const b1 = await bankroll();
  const want = (await d.select().from(schema.picks)).reduce((s, p) => s + (p.profit ?? 0), 0);
  check("together they settle each pick once", c1.settled + c2.settled === all.length, `${c1.settled} + ${c2.settled} for ${all.length} picks`);
  check("bankroll counted once", near(b1 - b0, want, 0.011), `${b0} → ${b1}, picks' profit ${want.toFixed(2)}`);

  // ---------- C. two daily runs at once ----------
  section("C. Two daily runs at the same time");
  await reset();
  const both = await Promise.allSettled([daily(), daily()]);
  const runs = await d.select().from(schema.runs).where(eq(schema.runs.kind, "DAILY"));
  const refused = both.filter((x) => x.status === "rejected" && (x.reason as Error).name === "RunInProgressError").length;
  check("the second run is refused while the first one runs", refused === 1 && runs.length === 1, `${both.map((x) => x.status).join(", ")}; ${runs.length} DAILY rows`);
  check("no duplicate picks", (await d.select().from(schema.picks)).length === (await d.execute(sql`select distinct match_id, key from picks`)).rows.length);

  // ---------- D. football-data down or broken ----------
  section("D. CSV source down, garbage or malformed");
  await reset();
  process.env.FOOTBALL_DATA_BASE_URL = "http://127.0.0.1:9"; // read at import: use the module's own fetch via a fresh import below
  const downStart = Date.now();
  const down = await within(
    (async () => {
      const r = spawnSync(process.execPath, ["--import", "tsx", "-e", `import("./src/lib/pipeline/daily").then((m) => m.runDaily()).then(() => process.exit(0), (e) => { console.error(e.message); process.exit(3); })`], {
        env: { ...process.env, FOOTBALL_DATA_BASE_URL: "http://127.0.0.1:9" },
        encoding: "utf8",
        timeout: 60_000,
      });
      return r;
    })()
  );
  const downRun = (await d.select().from(schema.runs).where(eq(schema.runs.kind, "DAILY")))[0];
  check(
    "source down: the run fails fast with a clear error and is marked failed",
    down !== "timeout" && down.status === 3 && Boolean(downRun?.error) && Boolean(downRun?.finishedAt) && Date.now() - downStart < 60_000,
    down === "timeout" ? "timeout" : `${down.stderr.trim().split("\n").pop()?.slice(0, 100)}`
  );
  csv.state.mode = "garbage";
  const fx1 = await fetchFixtures(["E0"]);
  check("HTML error page with status 200: no fixtures, no crash", fx1.length === 0);
  csv.state.mode = "malformed";
  const fx2 = await fetchFixtures(["E0"]);
  const odd = fx2.flatMap((f) => Object.values(f.odds)).filter((o) => !(Number.isFinite(o) && o > 1));
  check(
    "malformed CSV: rows with a bad date or a missing team dropped, quoted names kept",
    fx2.length === 4 && fx2.every((f) => f.home && f.away && !Number.isNaN(f.kickoff.getTime())) && fx2.some((f) => f.home === 'Nott\'m "Forest"'),
    fx2.map((f) => `${f.home}-${f.away}`).join(", ")
  );
  check("malformed CSV: no odds ≤ 1 or NaN kept", odd.length === 0);
  check("malformed CSV: an incomplete market is dropped, not half-kept", fx2.every((f) => ["1X2:HOME", "1X2:DRAW", "1X2:AWAY"].filter((k) => k in f.odds).length % 3 === 0));
  await reset();
  await daily();
  const settleDown = await runSettle({ now: settleAt }); // fetches the season files from the broken source
  const stillOpen = (await d.select().from(schema.matches)).every((m) => m.status === "SCHEDULED");
  check("settle with a broken source: nothing settled, matches stay open, run finishes", settleDown.settled === 0 && stillOpen && csv.state.hits > 0);

  // ---------- E. AI analyst failures ----------
  section("E. AI analyst: no key, timeout, bad JSON, hostile JSON, HTTP 500");
  const reviewed = async (mode: typeof ai.state.mode, opts: Record<string, unknown> = {}) => {
    await reset();
    ai.state.mode = mode;
    const t0 = Date.now();
    // 40 s for the AI work: 20 s for reviews, the rest kept for the summary.
    const r = await within(daily({ skipReview: false, reviewBudgetMs: 40_000, ...opts }), 120_000);
    const ms = Date.now() - t0;
    const rows = await d.select().from(schema.picks);
    const matchRows = await d.select().from(schema.matches);
    const [run] = await d.select().from(schema.runs).where(eq(schema.runs.kind, "DAILY"));
    return { r, ms, rows, matchRows, run };
  };
  const key = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "";
  const noKey = await reviewed("ok");
  process.env.ANTHROPIC_API_KEY = key;
  check("no key: picks saved without a review", noKey.r !== "timeout" && noKey.rows.length > 0 && noKey.rows.every((p) => p.verdict == null) && ai.state.calls === 0);
  const ok = await reviewed("ok");
  check("working analyst: every pick reviewed, summary saved", ok.r !== "timeout" && ok.rows.every((p) => p.verdict === "KEEP") && ok.run.summary === "QA summary.");
  const hang = await reviewed("hang");
  check(
    "analyst never answers: the run still finishes within its time budget, picks saved unreviewed",
    hang.r !== "timeout" && hang.ms < 60_000 && hang.rows.length > 0 && hang.rows.every((p) => p.verdict == null) && Boolean(hang.run?.finishedAt),
    hang.r === "timeout" ? "still running after 120s" : `${(hang.ms / 1000).toFixed(1)}s`
  );
  const bad = await reviewed("badjson");
  check("answer without JSON: picks saved unreviewed, run ok", bad.r !== "timeout" && bad.rows.length > 0 && bad.rows.every((p) => p.verdict == null) && !bad.run.error);
  const err = await reviewed("error500");
  check("HTTP 500: picks saved unreviewed, run ok", err.r !== "timeout" && err.rows.length > 0 && err.rows.every((p) => p.verdict == null) && !err.run.error);
  const nasty = await reviewed("nasty");
  const reviews = nasty.matchRows.map((m) => m.analysis as { headline: unknown; factors: { label: unknown; impact: unknown }[]; news: unknown[]; sources: { url: string }[] } | null).filter(Boolean);
  check("hostile JSON: CAUTION applied (stake halved)", nasty.rows.every((p) => p.verdict === "CAUTION"));
  check(
    "hostile JSON: stored review has only text where text is rendered",
    reviews.length > 0 && reviews.every((r) => typeof r!.headline === "string" && r!.factors.every((f) => typeof f.label === "string" && ["positive", "negative", "neutral"].includes(f.impact as string)) && r!.news.every((n) => typeof n === "string")),
    String(JSON.stringify(reviews[0]?.factors)).slice(0, 120)
  );
  check("hostile JSON: javascript: links dropped from the sources", reviews.every((r) => r!.sources.every((s) => /^https?:\/\//.test(s.url))), String(JSON.stringify(reviews[0]?.sources)).slice(0, 120));
  ai.state.mode = "hang";

  // ---------- F. database down ----------
  section("F. Database down");
  const t0 = Date.now();
  const dbDown = spawnSync(process.execPath, ["--import", "tsx", "scripts/daily.ts"], {
    env: { ...process.env, DATABASE_URL: "postgresql://qa:qa@127.0.0.1:9/none" },
    encoding: "utf8",
    timeout: 60_000,
  });
  check("job:daily with the database down exits non-zero quickly with the reason", dbDown.status === 1 && Date.now() - t0 < 30_000 && /ECONNREFUSED/.test(dbDown.stderr + dbDown.stdout), `${((Date.now() - t0) / 1000).toFixed(1)}s, exit ${dbDown.status}`);

  csv.close();
  ai.close();
  await closeDb();
  done();
  process.exit(process.exitCode ?? 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

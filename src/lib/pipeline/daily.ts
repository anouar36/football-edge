import { and, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb, getSettings } from "../db";
import { invalidate, TAG } from "../cache";
import { matches, picks, runs } from "../schema";
import { fetchFixtures, fetchHistory, matchId, type Fixture, type HistMatch } from "../data/footballdata";
import { leagueName } from "../data/leagues";
import { logoSummary, syncLogos } from "../data/logos";
import { fitLeague, predictMatch, type LeagueModel } from "../model/predict";
import { findValue, isPlayable, type Candidate, type StakeRules } from "../model/value";
import { marketLabel } from "../model/markets";
import { activeProvider, getProvider, LLM_TIMEOUTS, type SummaryPick } from "../llm";

export interface DailyResult {
  runId: string;
  matches: number;
  picks: number;
  log: string[];
}

/** Thrown when another daily run is still going (the cron and the button at the same time, or a double click). */
export class RunInProgressError extends Error {
  name = "RunInProgressError";
}

/**
 * A daily run that has not finished after this long was stopped (Vercel ends a function after
 * 300 s): it no longer blocks a new run and is marked failed.
 */
const STALE_RUN = "10 minutes";
/** pg_advisory_xact_lock key: makes "is a run going? if not, start one" a single step across instances. */
const DAILY_LOCK = 734_501;

/**
 * Time for the AI work (reviews and summary), counted from the start of the run. The web routes
 * also settle first and stop at 300 s, so the default leaves room for that; scripts/daily.ts
 * (GitHub Actions, no limit) passes more. Picks left when it runs out are saved without a review.
 */
export const DEFAULT_REVIEW_BUDGET_MS = 200_000;
/** Kept back for the summary when reviews are scheduled. */
const SUMMARY_RESERVE_MS = 20_000;
/** A review is not started with less time than this left. */
const MIN_REVIEW_MS = 10_000;
/** Reviews running at the same time. */
const REVIEW_CONCURRENCY = 3;

/** Runs `fn` on every item, at most `limit` at a time. */
async function eachLimit<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export async function runDaily(
  opts: {
    now?: Date;
    fixtures?: Fixture[];
    history?: Record<string, HistMatch[]>;
    skipReview?: boolean;
    skipLogos?: boolean;
    reviewBudgetMs?: number;
  } = {}
): Promise<DailyResult> {
  const startedAt = Date.now();
  const deadline = startedAt + (opts.reviewBudgetMs ?? DEFAULT_REVIEW_BUDGET_MS);
  const db = getDb();
  const now = opts.now ?? new Date();
  const settings = await getSettings();
  const run = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${DAILY_LOCK})`);
    await tx
      .update(runs)
      .set({ finishedAt: new Date(), error: "Interrupted: the run stopped before finishing (time limit or crash)." })
      .where(and(eq(runs.kind, "DAILY"), isNull(runs.finishedAt), lte(runs.createdAt, sql`now() - ${STALE_RUN}::interval`)));
    const [busy] = await tx
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.kind, "DAILY"), isNull(runs.finishedAt), gt(runs.createdAt, sql`now() - ${STALE_RUN}::interval`)));
    if (busy) return null;
    const [r] = await tx.insert(runs).values({ kind: "DAILY", startedAt: now }).returning();
    return r;
  });
  if (!run) throw new RunInProgressError("An analysis is already running. Wait for it to finish (at most a few minutes).");
  const log: string[] = [];
  const say = (s: string) => {
    log.push(s);
    console.log(`[daily] ${s}`);
  };

  try {
    const leagues = settings.leagues.split(",").map((s) => s.trim()).filter(Boolean);
    const horizon = new Date(now.getTime() + settings.daysAhead * 86_400_000);

    // 1. Upcoming fixtures with odds
    const allFixtures = opts.fixtures ?? (await fetchFixtures(leagues));
    const fixtures = allFixtures.filter((f) => f.kickoff > now && f.kickoff <= horizon);
    say(`${fixtures.length} fixtures between now and +${settings.daysAhead} days`);

    // 1b. Logos for teams and leagues not cached yet. Runs alongside the analysis and never fails the run.
    const logos = opts.skipLogos
      ? null
      : syncLogos(
          { teams: fixtures.flatMap((f) => [{ name: f.home, league: f.league }, { name: f.away, league: f.league }]), leagues: fixtures.map((f) => f.league) },
          { budgetMs: 90_000 }
        )
          .then((r) => {
            const line = logoSummary(r);
            if (line) say(line);
          })
          .catch((e) => say(`logos: ${(e as Error).message}`));

    // 2. Fit one model per league that has fixtures
    const models: Record<string, LeagueModel> = {};
    for (const league of Array.from(new Set(fixtures.map((f) => f.league)))) {
      const history = opts.history?.[league] ?? (await fetchHistory(league, now));
      if (history.length < 50) {
        say(`${league}: only ${history.length} past matches, skipped`);
        continue;
      }
      models[league] = fitLeague(league, history, now);
      const g = models[league].goals;
      say(`${league}: fitted on ${g.nMatches} matches (rho ${g.rho}, home adv ${g.homeAdv.toFixed(2)})`);
    }

    const rules: StakeRules = {
      bankroll: settings.bankroll,
      kellyFraction: settings.kellyFraction,
      maxStakePct: settings.maxStakePct,
      minEdge: settings.minEdge,
      minProb: settings.minProb,
      minOdds: settings.minOdds,
      maxOdds: settings.maxOdds,
      modelWeight: settings.modelWeight,
    };

    // 3. Predict + find value
    const best: { fixture: Fixture; id: string; cand: Candidate; pred: ReturnType<typeof predictMatch> }[] = [];
    let analysed = 0;
    for (const f of fixtures) {
      const model = models[f.league];
      if (!model) continue;
      const pred = predictMatch(model, f.home, f.away);
      const id = matchId(f.league, f.kickoff, f.home, f.away);
      const candidates = findValue(pred.probs, f.odds, rules);
      const prediction = { ...pred, candidates };
      await db
        .insert(matches)
        .values({ id, league: f.league, kickoff: f.kickoff, home: f.home, away: f.away, odds: f.odds, prediction })
        .onConflictDoUpdate({ target: matches.id, set: { kickoff: f.kickoff, odds: f.odds, prediction, updatedAt: new Date() } });
      analysed++;
      const playable = candidates.filter((c) => isPlayable(c, rules)).sort((a, b) => b.edge - a.edge);
      // Skip matches the model knows little about.
      if (playable[0] && !pred.dataWarning) best.push({ fixture: f, id, cand: playable[0], pred });
    }

    const chosen = best.sort((a, b) => b.cand.edge - a.cand.edge).slice(0, settings.maxPicksPerDay);
    say(`${analysed} matches analysed, ${best.length} with value, keeping ${chosen.length}`);

    // 4. Drop stale suggestions for matches we re-analysed (picks saved from a screenshot are the user's, keep them)
    const analysedIds = fixtures.filter((f) => models[f.league]).map((f) => matchId(f.league, f.kickoff, f.home, f.away));
    const keep = new Set(chosen.map((c) => `${c.id}|${c.cand.key}`));
    if (analysedIds.length) {
      const stale = await db
        .select()
        .from(picks)
        .where(and(inArray(picks.matchId, analysedIds), eq(picks.status, "SUGGESTED"), eq(picks.result, "PENDING"), eq(picks.source, "MODEL")));
      for (const p of stale) if (!keep.has(`${p.matchId}|${p.key}`)) await db.delete(picks).where(eq(picks.id, p.id));
    }

    // 5. Save picks, then let the AI analyst review each one: a few at a time, within the time budget
    const llm = opts.skipReview ? null : getProvider(settings);
    if (!opts.skipReview) {
      const p = activeProvider(settings);
      say(llm ? `AI analyst: ${llm.name} (${llm.model})` : `AI analyst: ${p.name} has no ${p.keyEnv}, picks saved without a review`);
    }
    const timeLeft = () => deadline - Date.now();
    const saved: SummaryPick[] = [];
    let unreviewed = 0;
    await eachLimit(chosen, REVIEW_CONCURRENCY, async ({ fixture: f, id, cand, pred }, i) => {
      const label = marketLabel(cand.key, f.home, f.away);
      const [existing] = await db.select().from(picks).where(and(eq(picks.matchId, id), eq(picks.key, cand.key)));
      if (existing && (existing.status !== "SUGGESTED" || existing.source !== "MODEL")) {
        saved[i] = { match: `${f.home} vs ${f.away}`, label, odds: existing.odds, prob: existing.prob, edge: existing.edge, stake: existing.stake, verdict: existing.verdict };
        return;
      }

      let verdict: string | null = null;
      let stakePct = cand.stakePct;
      const time = Math.min(LLM_TIMEOUTS.review, timeLeft() - SUMMARY_RESERVE_MS);
      if (llm && time < MIN_REVIEW_MS) unreviewed++;
      else if (llm) {
        const review = await llm.reviewPick(
          {
            league: leagueName(f.league),
            kickoff: f.kickoff.toISOString(),
            home: f.home,
            away: f.away,
            pick: { label, odds: cand.odds, prob: cand.prob, marketProb: cand.marketProb, edge: cand.edge },
            xgHome: pred.xgHome,
            xgAway: pred.xgAway,
            topScores: pred.topScores,
            language: settings.language,
            useWebSearch: settings.useWebSearch,
          },
          { timeoutMs: time }
        );
        if (review) {
          verdict = review.verdict;
          await db.update(matches).set({ analysis: review }).where(eq(matches.id, id));
          if (verdict === "CAUTION") stakePct = stakePct / 2;
          if (verdict === "AVOID") stakePct = 0;
        }
      }
      const stake = Math.round(settings.bankroll * stakePct * 100) / 100;
      const data = {
        market: cand.market,
        selection: cand.selection,
        label,
        modelProb: cand.modelProb,
        marketProb: cand.marketProb,
        prob: cand.prob,
        odds: cand.odds,
        edge: cand.edge,
        kelly: cand.kelly,
        stakePct,
        stake,
        verdict,
        runDate: now,
      };
      await db
        .insert(picks)
        .values({ matchId: id, key: cand.key, ...data })
        .onConflictDoUpdate({ target: [picks.matchId, picks.key], set: data });
      saved[i] = { match: `${f.home} vs ${f.away}`, label, odds: cand.odds, prob: cand.prob, edge: cand.edge, stake, verdict };
    });
    if (unreviewed) say(`AI time budget used: ${unreviewed} picks saved without a review`);

    const summaryTime = Math.min(LLM_TIMEOUTS.summary, timeLeft());
    const summary =
      llm && summaryTime >= 5_000
        ? await llm.dailySummary(saved, { bankroll: settings.bankroll, currency: settings.currency, language: settings.language, matchesAnalysed: analysed }, { timeoutMs: summaryTime })
        : null;

    await logos;
    await db
      .update(runs)
      .set({ finishedAt: new Date(), matchesAnalysed: analysed, picksCount: saved.length, summary: summary?.slice(0, 4000) ?? null, log: log.join("\n") })
      .where(eq(runs.id, run.id));
    await invalidate(TAG.matches, TAG.picks, TAG.runs, TAG.stats, TAG.logos);
    return { runId: run.id, matches: analysed, picks: saved.length, log };
  } catch (e) {
    const msg = (e as Error).stack ?? String(e);
    await db.update(runs).set({ finishedAt: new Date(), error: msg, log: log.join("\n") }).where(eq(runs.id, run.id));
    // Matches and picks saved before the error are in the database too.
    await invalidate(TAG.matches, TAG.picks, TAG.runs, TAG.stats);
    throw e;
  }
}

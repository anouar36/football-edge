import "./env";
import { runDaily } from "../src/lib/pipeline/daily";
import { runSettle } from "../src/lib/pipeline/settle";
import { closeDb } from "../src/lib/db";

// Settle yesterday first so the bankroll is up to date, then analyse today.
(async () => {
  try {
    const s = await runSettle();
    console.log(`settled ${s.settled} picks`);
    // No 300 s limit here (GitHub Actions or a terminal): give the AI analyst time to review every pick.
    const r = await runDaily({ reviewBudgetMs: 15 * 60_000 });
    console.log(`done: ${r.matches} matches, ${r.picks} picks`);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
})();

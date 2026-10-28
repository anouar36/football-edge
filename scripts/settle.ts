import "./env";
import { runSettle } from "../src/lib/pipeline/settle";
import { closeDb } from "../src/lib/db";

runSettle()
  .then((r) => console.log(`settled ${r.settled} picks, bankroll ${r.bankrollDelta.toFixed(2)}`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

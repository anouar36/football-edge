import { handleTelegramMessage, type TelegramUpdate } from "../src/lib/telegram/bot";

const token = process.env.TELEGRAM_TOKEN?.trim();

if (!token) {
  console.error("[telegram-bot] Error: TELEGRAM_TOKEN is not defined in environment.");
  process.exit(1);
}

console.log("==================================================");
console.log("🤖 EdgeXI Telegram Bot Polling Daemon Active");
console.log("Listening for incoming commands (/today, /bankroll, /status, /run, /help)...");
console.log("==================================================");

let offset = 0;
let running = true;

process.on("SIGINT", () => {
  console.log("\n[telegram-bot] Shutting down...");
  running = false;
  process.exit(0);
});

process.on("SIGTERM", () => {
  running = false;
  process.exit(0);
});

async function poll() {
  while (running) {
    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=20`;
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      const data = await res.json();

      if (!data.ok) {
        console.error("[telegram-bot] getUpdates failed:", data.description);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      const updates: TelegramUpdate[] = data.result || [];

      for (const u of updates) {
        offset = u.update_id + 1;
        const msg = u.message || u.edited_message;
        if (msg && msg.text) {
          console.log(
            `[telegram-bot] Received: "${msg.text}" from @${msg.from?.username || msg.from?.id} (${msg.chat.id})`
          );
          try {
            await handleTelegramMessage(msg);
          } catch (err) {
            console.error(`[telegram-bot] Error handling "${msg.text}":`, (err as Error).message);
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "TimeoutError") {
        console.error("[telegram-bot] Poll exception:", (e as Error).message);
      }
      // Brief pause on error before retrying
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

poll().catch((err) => {
  console.error("[telegram-bot] Fatal error:", err);
  process.exit(1);
});

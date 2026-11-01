/**
 * Telegram Bot Client for EdgeXI Quantitative Value Alerts (@football_edge_bot)
 */

export interface TelegramChat {
  id: string;
  name: string;
  username?: string;
  date: number;
}

export function getTelegramToken(): string | null {
  return process.env.TELEGRAM_TOKEN?.trim() || null;
}

/** Verify bot token and return bot identity */
export async function getBotInfo() {
  const token = getTelegramToken();
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json();
    return data.ok ? data.result : null;
  } catch (e) {
    console.error("[telegram] getMe failed:", (e as Error).message);
    return null;
  }
}

/** Check recent updates to auto-detect chat IDs from users who messaged the bot */
export async function getRecentChats(): Promise<TelegramChat[]> {
  const token = getTelegramToken();
  if (!token) return [];
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=20`, {
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.result)) return [];

    const chats = new Map<string, TelegramChat>();
    for (const update of data.result) {
      const msg = update.message || update.channel_post;
      if (msg?.chat?.id) {
        const id = String(msg.chat.id);
        const name = [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(" ") || msg.chat.title || "User";
        chats.set(id, {
          id,
          name,
          username: msg.chat.username,
          date: msg.date || Math.floor(Date.now() / 1000),
        });
      }
    }
    return Array.from(chats.values()).reverse();
  } catch (e) {
    console.error("[telegram] getRecentChats failed:", (e as Error).message);
    return [];
  }
}

/** Sends a message to a specific Telegram chat */
export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  options: { parse_mode?: "HTML" | "MarkdownV2"; disable_web_page_preview?: boolean } = { parse_mode: "HTML" }
): Promise<{ ok: boolean; error?: string }> {
  const token = getTelegramToken();
  if (!token) return { ok: false, error: "TELEGRAM_TOKEN is not configured" };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode,
        disable_web_page_preview: options.disable_web_page_preview ?? true,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("[telegram] sendMessage error:", data.description);
      return { ok: false, error: data.description };
    }
    return { ok: true };
  } catch (e) {
    console.error("[telegram] sendMessage exception:", (e as Error).message);
    return { ok: false, error: (e as Error).message };
  }
}

export interface PickAlertItem {
  match: string;
  league?: string;
  label: string;
  odds: number;
  prob: number;
  edge: number;
  stake: number;
  verdict?: string | null;
}

/** Formats and broadcasts newly discovered quantitative value picks */
export async function sendPicksAlert(
  chatId: string | number,
  picks: PickAlertItem[],
  settings: { currency: string; language: string; bankroll: number }
) {
  if (picks.length === 0) return;

  const isAr = settings.language === "ar" || settings.language === "darija";
  const header = isAr
    ? `🚨 <b>تنبيه فرص القيمة الكمية | EdgeXI</b>\n━━━━━━━━━━━━━━━━━━━━`
    : `🚨 <b>EdgeXI Quantitative Value Alert</b>\n━━━━━━━━━━━━━━━━━━━━`;

  const items = picks.map((p, idx) => {
    const edgePct = (p.edge * 100).toFixed(1);
    const probPct = (p.prob * 100).toFixed(1);
    const stakeAmt = p.stake.toFixed(2);

    if (isAr) {
      return (
        `<b>#${idx + 1} ⚽ ${p.match}</b>\n` +
        `🎯 <b>الرهان:</b> ${p.label}\n` +
        `📊 <b>الاحتمال الرياضي:</b> ${probPct}%\n` +
        `💰 <b>الأودز (Odds):</b> ${p.odds.toFixed(2)}\n` +
        `⚡ <b>الهامش الربحي (Edge):</b> +${edgePct}%\n` +
        `💵 <b>الرهان المقترح:</b> ${stakeAmt} ${settings.currency}` +
        (p.verdict ? `\n🧠 <i>تحليل AI: ${p.verdict}</i>` : "")
      );
    }

    return (
      `<b>#${idx + 1} ⚽ ${p.match}</b>\n` +
      `🎯 <b>Pick:</b> ${p.label}\n` +
      `📊 <b>Model Prob:</b> ${probPct}%\n` +
      `💰 <b>Bookmaker Odds:</b> ${p.odds.toFixed(2)}\n` +
      `⚡ <b>Edge:</b> +${edgePct}%\n` +
      `💵 <b>Suggested Stake:</b> ${stakeAmt} ${settings.currency}` +
      (p.verdict ? `\n🧠 <i>AI Verdict: ${p.verdict}</i>` : "")
    );
  }).join("\n\n────────────────────\n\n");

  const footer = isAr
    ? `\n━━━━━━━━━━━━━━━━━━━━\n🔒 <i>مبني وفق نموذج Dixon-Coles وإدارة المخاطر بمعيار Kelly.</i>`
    : `\n━━━━━━━━━━━━━━━━━━━━\n🔒 <i>Powered by Dixon-Coles Model & Kelly Bankroll Management.</i>`;

  const fullText = `${header}\n\n${items}${footer}`;
  return sendTelegramMessage(chatId, fullText);
}


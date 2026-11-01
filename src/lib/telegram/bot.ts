import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, getSettings, picksWithMatch } from "@/lib/db";
import { picks, runs } from "@/lib/schema";
import { marketLabel } from "@/lib/model/markets";
import { sendTelegramMessage } from "./client";
import { runDaily, RunInProgressError } from "@/lib/pipeline/daily";
import { runSettle } from "@/lib/pipeline/settle";
import type { Locale } from "@/lib/i18n";

export interface TelegramIncomingMessage {
  message_id: number;
  from?: {
    id: number;
    is_bot: boolean;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  chat: {
    id: number | string;
    type: string;
    first_name?: string;
    title?: string;
  };
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramIncomingMessage;
  edited_message?: TelegramIncomingMessage;
}

/**
 * Dispatches an incoming Telegram text command and sends the response.
 */
export async function handleTelegramMessage(msg: TelegramIncomingMessage) {
  if (!msg.text || !msg.chat?.id) return;

  const chatId = String(msg.chat.id);
  const rawText = msg.text.trim();
  if (!rawText.startsWith("/")) return;

  // e.g. "/today@football_edge_bot" -> "today"
  const parts = rawText.split(/\s+/);
  const commandWithMention = parts[0].slice(1).toLowerCase();
  const command = commandWithMention.split("@")[0];

  const settings = await getSettings();
  const locale: Locale = settings.language === "ar" || settings.language === "darija" ? "ar" : "en";
  const isAr = locale === "ar";

  switch (command) {
    case "start":
    case "help": {
      const name = msg.from?.first_name || (isAr ? "عزيزي" : "there");
      const text = isAr
        ? `⚽ <b>EdgeXI Quant Bot | المساعد الذكي</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
          `أهلاً بك <b>${name}</b> في بوت التحليل الرياضي الكمي وإدارة المحفظة.\n\n` +
          `📌 <b>الأوامر المتاحة:</b>\n` +
          `🎯 /today أو /picks — عرض رهانات القيمة لليوم\n` +
          `💰 /bankroll — تقرير رأس المال، الأرباح ونسبة العائد (ROI)\n` +
          `📊 /status — حالة النماذج الإحصائية والنظام\n` +
          `⚡ /run — تشغيل التحليل اليومي وتحديث الرهانات\n` +
          `❓ /help — عرض هذه القائمة والمساعدة`
        : `⚽ <b>EdgeXI Quant Bot | Intelligent Assistant</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
          `Welcome <b>${name}</b> to the EdgeXI quant analytics & bankroll bot.\n\n` +
          `📌 <b>Available Commands:</b>\n` +
          `🎯 /today or /picks — View today's qualifying value bets\n` +
          `💰 /bankroll — Bankroll balance, profit/loss, and ROI\n` +
          `📊 /status — System health and statistical model info\n` +
          `⚡ /run — Run daily quant pipeline analysis now\n` +
          `❓ /help — Display this help menu`;

      await sendTelegramMessage(chatId, text);
      break;
    }

    case "today":
    case "picks": {
      const openPicks = await picksWithMatch(and(eq(picks.result, "PENDING")), "kickoffAsc");

      if (openPicks.length === 0) {
        const text = isAr
          ? `🎯 <b>فرص القيمة الحالية | EdgeXI</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
            `لا توجد رهانات نشطة حالياً تستوفي شروط الأفضلية الرياضية.\n` +
            `(النموذج يراهن فقط عند وجود قيمة رياضية موجبة EV).\n\n` +
            `💡 <i>يمكنك إرسال /run لتشغيل التحليل والبحث في المباريات القادمة.</i>`
          : `🎯 <b>Current Value Picks | EdgeXI</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
            `No qualifying value picks available right now.\n` +
            `(The model only bets when mathematically advantageous EV is detected).\n\n` +
            `💡 <i>Send /run to execute the quant analysis pipeline.</i>`;
        await sendTelegramMessage(chatId, text);
        break;
      }

      const header = isAr
        ? `🎯 <b>فرص القيمة الحالية (${openPicks.length}) | EdgeXI</b>\n━━━━━━━━━━━━━━━━━━━━`
        : `🎯 <b>Current Value Picks (${openPicks.length}) | EdgeXI</b>\n━━━━━━━━━━━━━━━━━━━━`;

      const items = openPicks.map((p, idx) => {
        const label = marketLabel(p.key, p.match.home, p.match.away, locale);
        const edgePct = (p.edge * 100).toFixed(1);
        const probPct = (p.prob * 100).toFixed(1);
        const stakeAmt = Number(p.stake).toFixed(2);
        const kickoffTime = new Date(p.match.kickoff).toLocaleTimeString(isAr ? "ar-MA" : "en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC",
        });

        if (isAr) {
          return (
            `<b>#${idx + 1} ⚽ ${p.match.home} ضد ${p.match.away}</b>\n` +
            `🏆 الدوري: ${p.match.league} · ⏰ ${kickoffTime} UTC\n` +
            `🎯 <b>الرهان:</b> ${label}\n` +
            `📊 <b>الاحتمال الرياضي:</b> ${probPct}%\n` +
            `💰 <b>الأودز:</b> ${Number(p.odds).toFixed(2)}\n` +
            `⚡ <b>الهامش الربحي (Edge):</b> +${edgePct}%\n` +
            `💵 <b>الرهان المقترح:</b> ${stakeAmt} ${settings.currency}` +
            (p.verdict ? `\n🧠 <i>تحليل AI: ${p.verdict}</i>` : "")
          );
        }

        return (
          `<b>#${idx + 1} ⚽ ${p.match.home} vs ${p.match.away}</b>\n` +
          `🏆 League: ${p.match.league} · ⏰ ${kickoffTime} UTC\n` +
          `🎯 <b>Pick:</b> ${label}\n` +
          `📊 <b>Model Prob:</b> ${probPct}%\n` +
          `💰 <b>Bookmaker Odds:</b> ${Number(p.odds).toFixed(2)}\n` +
          `⚡ <b>Edge:</b> +${edgePct}%\n` +
          `💵 <b>Suggested Stake:</b> ${stakeAmt} ${settings.currency}` +
          (p.verdict ? `\n🧠 <i>AI Verdict: ${p.verdict}</i>` : "")
        );
      });

      const footer = isAr
        ? `\n━━━━━━━━━━━━━━━━━━━━\n🔒 <i>مبني وفق نموذج Dixon-Coles وإدارة المخاطر بمعيار Kelly.</i>`
        : `\n━━━━━━━━━━━━━━━━━━━━\n🔒 <i>Powered by Dixon-Coles Model & Kelly Staking.</i>`;

      // Split into chunks if message exceeds Telegram limit of 4096 chars
      const chunkSize = 4;
      for (let i = 0; i < items.length; i += chunkSize) {
        const slice = items.slice(i, i + chunkSize).join("\n\n────────────────────\n\n");
        const chunkText = i === 0 ? `${header}\n\n${slice}` : slice;
        const isLast = i + chunkSize >= items.length;
        await sendTelegramMessage(chatId, isLast ? `${chunkText}${footer}` : chunkText);
      }
      break;
    }

    case "bankroll":
    case "wallet":
    case "balance": {
      const db = getDb();
      const decided = inArray(picks.result, ["WON", "LOST"]);
      const [stats] = await db
        .select({
          n: sql<number>`count(*) FILTER (WHERE ${decided})::int`,
          wins: sql<number>`count(*) FILTER (WHERE ${picks.result} = 'WON')::int`,
          staked: sql<number>`coalesce(sum(${picks.stake}) FILTER (WHERE ${decided}), 0)::float8`,
          profit: sql<number>`coalesce(sum(${picks.profit}) FILTER (WHERE ${decided}), 0)::float8`,
        })
        .from(picks);

      const roi = stats.staked > 0 ? (stats.profit / stats.staked) * 100 : 0;
      const hitRate = stats.n > 0 ? (stats.wins / stats.n) * 100 : 0;
      const profitFormatted = `${stats.profit >= 0 ? "+" : ""}${stats.profit.toFixed(2)}`;
      const roiFormatted = `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`;

      const text = isAr
        ? `💰 <b>تقرير رأس المال والمحفظة | EdgeXI</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
          `💵 <b>رأس المال الحالي:</b> ${Number(settings.bankroll).toFixed(2)} ${settings.currency}\n` +
          `📈 <b>صافي الربح / الخسارة:</b> ${profitFormatted} ${settings.currency}\n` +
          `🎯 <b>نسبة العائد (ROI):</b> ${roiFormatted}\n` +
          `🏆 <b>نسبة الفوز (Win Rate):</b> ${hitRate.toFixed(1)}% (${stats.wins}/${stats.n} رهان مُسوّى)\n` +
          `🛡️ <b>نسبة Kelly:</b> ${(Number(settings.kellyFraction) * 100).toFixed(0)}%\n` +
          `🔒 <b>الحد الأقصى للرهان:</b> ${(Number(settings.maxStakePct) * 100).toFixed(1)}% من رأس المال`
        : `💰 <b>Bankroll & Portfolio Report | EdgeXI</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
          `💵 <b>Current Bankroll:</b> ${Number(settings.bankroll).toFixed(2)} ${settings.currency}\n` +
          `📈 <b>Net Profit / Loss:</b> ${profitFormatted} ${settings.currency}\n` +
          `🎯 <b>Return on Investment (ROI):</b> ${roiFormatted}\n` +
          `🏆 <b>Win Rate:</b> ${hitRate.toFixed(1)}% (${stats.wins}/${stats.n} settled bets)\n` +
          `🛡️ <b>Kelly Staking:</b> ${(Number(settings.kellyFraction) * 100).toFixed(0)}%\n` +
          `🔒 <b>Max Stake Cap:</b> ${(Number(settings.maxStakePct) * 100).toFixed(1)}% of bankroll`;

      await sendTelegramMessage(chatId, text);
      break;
    }

    case "status":
    case "info": {
      const db = getDb();
      const [lastDaily] = await db
        .select()
        .from(runs)
        .where(eq(runs.kind, "DAILY"))
        .orderBy(desc(runs.startedAt))
        .limit(1);

      const aiName =
        settings.llmProvider === "gemini"
          ? "Google Gemini 2.5 Flash"
          : settings.llmProvider === "anthropic"
            ? "Anthropic Claude 3.5 Sonnet"
            : "OpenAI GPT-4o";

      const lastRun = lastDaily?.startedAt
        ? new Date(lastDaily.startedAt).toLocaleString(isAr ? "ar-MA" : "en-GB", { timeZone: "UTC" }) + " UTC"
        : isAr
          ? "لا يوجد بعد"
          : "None yet";

      const text = isAr
        ? `📊 <b>حالة النظام والنماذج | EdgeXI</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
          `🟢 <b>حالة النظام:</b> متصل ويعمل بنجاح\n` +
          `🧠 <b>المحلل الذكي:</b> ${aiName}\n` +
          `📈 <b>النموذج الرياضي:</b> Dixon-Coles Bivariate Poisson (ρ correction)\n` +
          `🏆 <b>الدوريات المتابعة:</b> ${settings.leagues}\n` +
          `⏱️ <b>آخر تشغيل للتحليل:</b> ${lastRun}\n` +
          `📋 <b>نتائج آخر تشغيل:</b> ${lastDaily?.matchesAnalysed ?? 0} مباراة · ${lastDaily?.picksCount ?? 0} رهانات قيمة`
        : `📊 <b>System & Model Status | EdgeXI</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
          `🟢 <b>System Status:</b> Connected & Operational\n` +
          `🧠 <b>AI Analyst:</b> ${aiName}\n` +
          `📈 <b>Quant Model:</b> Dixon-Coles Bivariate Poisson (ρ correction)\n` +
          `🏆 <b>Active Leagues:</b> ${settings.leagues}\n` +
          `⏱️ <b>Last Analysis Run:</b> ${lastRun}\n` +
          `📋 <b>Last Run Results:</b> ${lastDaily?.matchesAnalysed ?? 0} matches · ${lastDaily?.picksCount ?? 0} value picks`;

      await sendTelegramMessage(chatId, text);
      break;
    }

    case "run": {
      const allowedId = String(settings.telegramChatId || process.env.TELEGRAM_CHAT_ID || "");
      if (allowedId && chatId !== allowedId) {
        await sendTelegramMessage(
          chatId,
          isAr
            ? `⛔ <b>غير مصرح:</b> هذا الأمر مخصص لمدير الحساب فقط.`
            : `⛔ <b>Unauthorized:</b> Only the configured admin chat can trigger pipeline runs.`
        );
        break;
      }

      await sendTelegramMessage(
        chatId,
        isAr
          ? `⏳ <b>جارٍ تشغيل التحليل الرياضي الآن…</b>\nجلب البيانات وتدريب نماذج Dixon-Coles وتوليد مراجعات الذكاء الاصطناعي.`
          : `⏳ <b>Running quant analysis pipeline now…</b>\nFetching fixtures, fitting Dixon-Coles models, and generating AI reviews.`
      );

      try {
        const settled = await runSettle();
        const daily = await runDaily();

        await sendTelegramMessage(
          chatId,
          isAr
            ? `✅ <b>اكتمل التحليل بنجاح!</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
              `⚽ <b>المباريات المحللة:</b> ${daily.matches}\n` +
              `🎯 <b>فرص القيمة المكتشفة:</b> ${daily.picks}\n` +
              `⚖️ <b>الرهانات المسوّاة:</b> ${settled.settled}\n\n` +
              `💡 <i>أرسل /today لعرض تفاصيل الرهانات المتاحة.</i>`
            : `✅ <b>Pipeline completed successfully!</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
              `⚽ <b>Matches analysed:</b> ${daily.matches}\n` +
              `🎯 <b>Value picks discovered:</b> ${daily.picks}\n` +
              `⚖️ <b>Settled bets:</b> ${settled.settled}\n\n` +
              `💡 <i>Send /today to view the picks.</i>`
        );
      } catch (err) {
        if (err instanceof RunInProgressError) {
          await sendTelegramMessage(
            chatId,
            isAr
              ? `⚠️ يوجد تحليل قيد التشغيل بالفعل. يرجى الانتظار بضع دقائق.`
              : `⚠️ An analysis run is already in progress. Please wait a few minutes.`
          );
        } else {
          await sendTelegramMessage(
            chatId,
            isAr
              ? `❌ <b>فشل التحليل:</b> ${(err as Error).message}`
              : `❌ <b>Pipeline failed:</b> ${(err as Error).message}`
          );
        }
      }
      break;
    }

    default: {
      const text = isAr
        ? `⚠️ أمر غير معروف: <code>/${command}</code>\nأرسل /help لعرض قائمة الأوامر المتاحة.`
        : `⚠️ Unknown command: <code>/${command}</code>\nSend /help to view available commands.`;
      await sendTelegramMessage(chatId, text);
      break;
    }
  }
}

import { NextResponse } from "next/server";
import { denyAnonymous } from "@/lib/auth/server";
import { getSettings } from "@/lib/db";
import { getBotInfo, sendTelegramMessage } from "@/lib/telegram/client";

/**
 * Sends a test notification to the configured Telegram chat ID.
 */
export async function POST(req: Request) {
  const denied = await denyAnonymous();
  if (denied) return denied;

  const settings = await getSettings();
  const body = await req.json().catch(() => ({}));
  const chatId = body.chatId || settings.telegramChatId || process.env.TELEGRAM_CHAT_ID;

  if (!chatId) {
    return NextResponse.json({ error: "No Telegram Chat ID configured" }, { status: 400 });
  }

  const bot = await getBotInfo();
  if (!bot) {
    return NextResponse.json({ error: "Failed to connect to Telegram Bot. Check TELEGRAM_TOKEN." }, { status: 502 });
  }

  const isAr = settings.language === "ar" || settings.language === "darija";
  const text = isAr
    ? `⚽ <b>EdgeXI | اختبار الاتصال بنجاح</b>\n━━━━━━━━━━━━━━━━━━━━\nتم ربط البوت <b>@${bot.username}</b> بنجاح بنظام التحليل الكمي.\nستصلك تنبيهات فرص القيمة والرهانات هنا فور اكتشافها!\n\n⚡ <i>الحالة: متصل ومفعل</i>`
    : `⚽ <b>EdgeXI | Connection Test Successful</b>\n━━━━━━━━━━━━━━━━━━━━\nBot <b>@${bot.username}</b> is successfully linked to your quant analytics pipeline.\nValue picks will be delivered here automatically when discovered!\n\n⚡ <i>Status: Connected & Active</i>`;

  const result = await sendTelegramMessage(chatId, text);
  if (!result.ok) {
    return NextResponse.json({ error: result.error || "Failed to deliver message" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, botUsername: bot.username });
}


import { NextResponse } from "next/server";
import { handleTelegramMessage, type TelegramUpdate } from "@/lib/telegram/bot";

export const dynamic = "force-dynamic";

/**
 * Telegram Webhook endpoint (for production deployments).
 * Telegram POSTs updates here whenever a user sends a message to @football_edge_bot.
 */
export async function POST(req: Request) {
  try {
    const update = (await req.json()) as TelegramUpdate;
    const msg = update.message || update.edited_message;

    if (msg) {
      // Process command
      await handleTelegramMessage(msg);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[telegram webhook error]:", (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

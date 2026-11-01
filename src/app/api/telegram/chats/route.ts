import { NextResponse } from "next/server";
import { denyAnonymous } from "@/lib/auth/server";
import { getBotInfo, getRecentChats } from "@/lib/telegram/client";

/**
 * Lists recent chats that interacted with @football_edge_bot so the user can easily auto-select their Chat ID.
 */
export async function GET() {
  const denied = await denyAnonymous();
  if (denied) return denied;

  const [bot, chats] = await Promise.all([getBotInfo(), getRecentChats()]);
  if (!bot) {
    return NextResponse.json({ error: "Bot not reachable. Check TELEGRAM_TOKEN." }, { status: 502 });
  }

  return NextResponse.json({
    bot: { id: bot.id, username: bot.username, name: bot.first_name },
    chats,
  });
}


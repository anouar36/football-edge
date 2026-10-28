import "./env";
/**
 * Fills the database with a SYNTHETIC league so you can explore the dashboard
 * without internet access or an API key. Nothing here is real data.
 *   npm run seed:demo
 */
import { and, desc, eq } from "drizzle-orm";
import { closeDb, getDb, picksWithMatch } from "../src/lib/db";
import { ALL_TAGS, invalidate } from "../src/lib/cache";
import { matches, picks as picksT, runs, settings } from "../src/lib/schema";
import { runDaily } from "../src/lib/pipeline/daily";
import { runSettle } from "../src/lib/pipeline/settle";
import { synthLeague } from "./synthetic";
import type { HistMatch } from "../src/lib/data/footballdata";

(async () => {
  const db = getDb();
  await db.delete(picksT);
  await db.delete(matches);
  await db.delete(runs);
  await db.insert(settings).values({ id: 1, leagues: "E0" }).onConflictDoUpdate({ target: settings.id, set: { bankroll: 1000, leagues: "E0" } });

  const L = synthLeague({ seasons: 2, start: new Date(Date.UTC(2024, 7, 10, 14)) });
  const history: HistMatch[] = [...L.history];
  const today = new Date();
  today.setUTCHours(8, 0, 0, 0);

  // 40 past "days" of picks, settled, then today's picks left open
  for (let d = 40; d >= 0; d--) {
    const now = new Date(today.getTime() - d * 86_400_000);
    const fixtures = L.fixtures(now, 10);
    await runDaily({ now, fixtures, history: { E0: history }, skipReview: true, skipLogos: true });
    if (d === 0) break;
    const open = await db.select().from(picksT).where(and(eq(picksT.result, "PENDING"), eq(picksT.status, "SUGGESTED")));
    for (const p of open) if (Math.random() < 0.6) await db.update(picksT).set({ status: "PLACED" }).where(eq(picksT.id, p.id));
    const played = fixtures.map(L.play);
    history.push(...played);
    await runSettle({ now: new Date(now.getTime() + 86_400_000), results: history });
  }

  // Example Claude review so the analysis panel is visible (clearly marked as demo)
  const picks = await picksWithMatch(eq(picksT.result, "PENDING"));
  for (const [i, p] of picks.entries()) {
    const verdict = i % 4 === 3 ? "CAUTION" : "KEEP";
    const review = {
      verdict,
      headline: "مثال تجريبي: هذه بيانات اصطناعية وليست تحليلاً حقيقياً",
      summary:
        "يظهر هنا تحليل Claude عند ضبط مفتاح ANTHROPIC_API_KEY. سيبحث Claude عن الإصابات والإيقافات والتشكيلة المتوقعة، ثم يقرر هل يبقى الرهان أم يُخفَّض أم يُلغى. الاحتمالات تأتي من النموذج الإحصائي وليس من Claude.",
      factors: [
        { label: "الفريق المضيف يسجل أكثر من المتوسط في آخر المباريات (مثال)", impact: "positive" },
        { label: "احتمال تدوير اللاعبين قبل مباراة أوروبية (مثال)", impact: "negative" },
        { label: "لا توجد أخبار إصابات مؤكدة (مثال)", impact: "neutral" },
      ],
      news: ["في الوضع الحقيقي تظهر هنا آخر أخبار الفريقين مع روابط المصادر."],
      sources: [],
      model: "demo (no API key)",
      reviewedAt: new Date().toISOString(),
    };
    await db.update(matches).set({ analysis: review }).where(eq(matches.id, p.matchId));
    await db
      .update(picksT)
      .set({ verdict, ...(verdict === "CAUTION" ? { stakePct: p.stakePct / 2, stake: Math.round(p.stake * 50) / 100 } : {}) })
      .where(eq(picksT.id, p.id));
  }
  const [last] = await db.select().from(runs).where(eq(runs.kind, "DAILY")).orderBy(desc(runs.startedAt)).limit(1);
  if (last)
    await db
      .update(runs)
      .set({
        summary:
          "بيانات تجريبية. في التشغيل الحقيقي يكتب Claude هنا ملخص اليوم: عدد الرهانات، مجموع المبالغ مقارنة برأس المال، وعدد الرهانات المتوقع أن تربح في المتوسط، مع التنبيه على الرهانات التي عليها تحفظ. تذكير: الرهانات ذات القيمة تخسر كثيراً، والأفضلية لا تظهر إلا بعد مئات الرهانات.",
      })
      .where(eq(runs.id, last.id));
  const counts = { matches: (await db.select().from(matches)).length, picks: (await db.select().from(picksT)).length };
  console.log("demo seeded", counts);
  await invalidate(...ALL_TAGS);
  await closeDb();
})();

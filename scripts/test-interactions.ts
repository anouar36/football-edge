import { chromium } from "playwright";
import { getDb } from "../src/lib/db";
import { authRateLimits } from "../src/lib/schema";

async function testAllInteractions() {
  const db = await getDb();
  await db.delete(authRateLimits);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const errors: string[] = [];
  page.on("pageerror", (err) => {
    console.error("BROWSER PAGE ERROR:", err.message, err.stack);
    errors.push(err.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error("BROWSER CONSOLE ERROR:", msg.text());
      errors.push(msg.text());
    }
  });

  const baseUrl = "http://localhost:3000";

  console.log("1. Logging in...");
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "ndnd15237@gmail.com");
  await page.fill('input[type="password"]', "EdgeXI#2026!");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("/login")),
    page.click('button[type="submit"]'),
  ]);

  console.log("2. Navigating to /matches via link...");
  const matchesNavLink = page.locator('aside a[href="/matches"]').first();
  await matchesNavLink.click();
  await page.waitForURL((u) => u.pathname.includes("/matches"));
  await page.waitForTimeout(600);

  console.log("3. Testing Finished matches tab (/matches?past=1)...");
  const finishedTab = page.locator('a[href="/matches?past=1"]').first();
  await finishedTab.click();
  await page.waitForURL((u) => u.search.includes("past=1"));
  await page.waitForTimeout(600);

  console.log("4. Testing Upcoming matches tab (/matches)...");
  const upcomingTab = page.locator('a[href="/matches"]').first();
  await upcomingTab.click();
  await page.waitForURL((u) => !u.search.includes("past=1"));
  await page.waitForTimeout(600);

  console.log("5. Testing League Filter Pills...");
  const pills = page.locator('div[class*="overflow-x-auto"] button');
  const pillCount = await pills.count();
  console.log(`Found ${pillCount} filter pills`);
  for (let i = 0; i < pillCount; i++) {
    await pills.nth(i).click();
    await page.waitForTimeout(200);
  }
  // Click "All" again
  await pills.first().click();
  await page.waitForTimeout(200);

  console.log("6. Testing Search input...");
  const search = page.locator('input[type="search"]').first();
  await search.fill("Inter");
  await page.waitForTimeout(300);
  await search.fill("");
  await page.waitForTimeout(300);

  console.log("7. Testing Match Row Click (opens Drawer)...");
  const firstRow = page.locator("tbody tr").first();
  await firstRow.click();
  await page.waitForTimeout(600);

  console.log("8. Testing Sheet interaction inside Drawer...");
  const sheet = page.locator('[role="dialog"]').first();
  const sheetVisible = await sheet.isVisible();
  console.log("Is sheet visible after row click?", sheetVisible);

  console.log("9. Closing Sheet with Escape...");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  console.log("10. Testing Quick View Eye Button click...");
  const eyeBtn = page.locator('button[aria-label="Quick view"]').first();
  await eyeBtn.click();
  await page.waitForTimeout(600);
  console.log("Is sheet visible after eye click?", await sheet.isVisible());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  console.log("11. Testing 'Add to Ticket' button...");
  const addBtn = page.locator('tbody tr button[aria-label*="ورقة"], tbody tr button[aria-label*="ticket"]').first();
  if (await addBtn.isVisible()) {
    await addBtn.click();
    await page.waitForTimeout(500);
    console.log("Clicked add to ticket!");
  }

  console.log("12. Testing Match Detail navigation (/matches/[id])...");
  const matchDetailLink = page.locator("tbody tr a[href^=\"/matches/\"]").first();
  await matchDetailLink.click();
  await page.waitForURL((u) => u.pathname.startsWith("/matches/"));
  await page.waitForTimeout(800);
  console.log("Match detail page loaded:", page.url());

  console.log("13. Going back to /matches...");
  const backLink = page.locator('a[href="/matches"]').first();
  await backLink.click();
  await page.waitForURL((u) => u.pathname === "/matches");
  await page.waitForTimeout(600);

  await browser.close();

  if (errors.length > 0) {
    console.error("Errors caught during interactions:", errors);
    throw new Error(`Encountered ${errors.length} errors!`);
  }

  console.log("ALL 13 INTERACTION TESTS PASSED WITH 0 ERRORS!");
}

testAllInteractions().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});

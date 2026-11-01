import { chromium } from "playwright";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on("pageerror", (err) => {
    console.error(">>> BROWSER PAGE ERROR:", err.message, "\nSTACK:", err.stack);
  });
  page.on("console", (msg) => {
    console.log(`[BROWSER ${msg.type().toUpperCase()}]:`, msg.text());
  });

  const baseUrl = "http://localhost:3000";

  console.log("1. Go to /login...");
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });

  console.log("2. Sign in...");
  await page.fill('input[type="email"]', "ndnd15237@gmail.com");
  await page.fill('input[type="password"]', "EdgeXI#2026!");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.click('button[type="submit"]'),
  ]);

  console.log("3. Navigate to /matches...");
  await page.goto(`${baseUrl}/matches`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const errorBoundary = await page.locator('[role="alert"]').count();
  if (errorBoundary > 0) {
    const errorText = await page.locator('[role="alert"]').allInnerTexts();
    console.error("ALERT TEXT ON PAGE:\n", errorText.join("\n---\n"));
  } else {
    console.log("/matches loaded cleanly with NO error boundary!");
  }

  await browser.close();
}

run().catch((e) => {
  console.error("Test script failed:", e);
  process.exit(1);
});

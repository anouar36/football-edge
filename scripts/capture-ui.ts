import { chromium } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";

async function capture() {
  const outDir = "/home/protocol/.gemini/antigravity/brain/0314b4be-06dd-4a68-8d35-6fdf70e9ccd5/screenshots";
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  const baseUrl = "http://localhost:3000";

  console.log("1. Authenticating...");
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "ndnd15237@gmail.com");
  await page.fill('input[type="password"]', "EdgeXI#2026!");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.click('button[type="submit"]'),
  ]);

  console.log("2. Dashboard (Arabic RTL Dark)...");
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const darkBtn = page.locator('button[role="radio"][aria-label*="داكن"], button[role="radio"][aria-label*="Dark"]').first();
  if (await darkBtn.isVisible()) {
    await darkBtn.click();
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: path.join(outDir, "hallmark-dashboard-dark-ar.png"), fullPage: true });

  console.log("3. Picks Page (Arabic RTL Dark)...");
  await page.goto(`${baseUrl}/picks`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, "hallmark-picks-dark-ar.png"), fullPage: true });

  console.log("4. Matches Page (Arabic RTL Dark)...");
  await page.goto(`${baseUrl}/matches`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, "hallmark-matches-dark-ar.png"), fullPage: true });

  console.log("5. Quick View Drawer (Arabic RTL Dark)...");
  const quickViewBtn = page.locator('button[aria-label="Quick view"]').first();
  if (await quickViewBtn.isVisible()) {
    await quickViewBtn.click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(outDir, "hallmark-matches-drawer-ar.png"), fullPage: false });
    // Close the drawer
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }

  console.log("6. Switching to English LTR...");
  const enBtn = page.locator('button[role="radio"]:has-text("English")').first();
  if (await enBtn.isVisible()) {
    await enBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, "hallmark-matches-en.png"), fullPage: true });
  }

  await browser.close();
  console.log("Screenshots captured successfully to:", outDir);
}

capture().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});

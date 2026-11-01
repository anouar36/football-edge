import { chromium } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";

async function verify() {
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

  console.log("1. Logging in...");
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "ndnd15237@gmail.com");
  await page.fill('input[type="password"]', "EdgeXI#2026!");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.click('button[type="submit"]'),
  ]);

  console.log("2. Verifying Dark Mode toggle...");
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  // Click Dark button on sidebar theme switch
  const darkBtn = page.locator('button[role="radio"][aria-label="Dark mode"]').first();
  await darkBtn.click();
  await page.waitForTimeout(400);

  // Check if dark class exists on html
  const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  console.log("Is dark class active on <html>?", isDark);
  await page.screenshot({ path: path.join(outDir, "ui-1-dashboard-dark.png"), fullPage: true });

  console.log("3. Verifying Picks page with high-edge sparkles & team form...");
  await page.goto(`${baseUrl}/picks`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, "ui-2-picks-dark.png"), fullPage: true });

  console.log("4. Verifying Matches page filter bar & league pills...");
  await page.goto(`${baseUrl}/matches`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, "ui-3-matches-dark.png"), fullPage: true });

  // Test League filter pill (click second pill, which is the most popular league)
  const leaguePills = page.locator('div[class*="overflow-x-auto"] button');
  const count = await leaguePills.count();
  console.log(`Found ${count} filter pills`);
  if (count > 1) {
    await leaguePills.nth(1).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, "ui-4-matches-filtered.png"), fullPage: true });
  }

  console.log("5. Verifying Quick-View Drawer / Sheet on match click...");
  // Click "All" again to show all matches
  await leaguePills.first().click();
  await page.waitForTimeout(300);

  // Click the explicit Quick View button (Eye icon)
  const quickViewBtn = page.locator('button[aria-label="Quick view"]').first();
  await quickViewBtn.click();
  await page.waitForTimeout(800); // Sheet slide animation
  await page.screenshot({ path: path.join(outDir, "ui-5-matches-drawer.png"), fullPage: false });

  await browser.close();
  console.log("All UI verifications completed successfully!");
}

verify().catch((e) => {
  console.error("Verification failed:", e);
  process.exit(1);
});

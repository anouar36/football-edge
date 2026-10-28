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

  // Login
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "ndnd15237@gmail.com");
  await page.fill('input[type="password"]', "EdgeXI#2026!");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.click('button[type="submit"]'),
  ]);

  // Dashboard
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(outDir, "1-dashboard.png"), fullPage: true });

  // Picks
  await page.goto(`${baseUrl}/picks`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(outDir, "2-picks.png"), fullPage: true });

  // Matches
  await page.goto(`${baseUrl}/matches`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(outDir, "3-matches.png"), fullPage: true });

  // History
  await page.goto(`${baseUrl}/history`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(outDir, "4-history.png"), fullPage: true });

  // Settings
  await page.goto(`${baseUrl}/settings`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(outDir, "5-settings.png"), fullPage: true });

  await browser.close();
  console.log("Screenshots captured successfully to:", outDir);
}

capture().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});


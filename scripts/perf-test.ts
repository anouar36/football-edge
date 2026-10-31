import { chromium, type Page } from "playwright";

interface PerfResult {
  page: string;
  url: string;
  ttfbMs: number;
  fcpMs: number;
  domReadyMs: number;
  loadMs: number;
  requestsCount: number;
  transferSizeKb: number;
  clientNavMs?: number;
}

async function measurePagePerformance(page: Page, targetUrl: string, name: string): Promise<PerfResult> {
  let requests = 0;
  let totalBytes = 0;

  const requestListener = (req: any) => {
    requests++;
  };
  const responseListener = (res: any) => {
    const headers = res.headers();
    const len = headers["content-length"];
    if (len) totalBytes += parseInt(len, 10);
  };

  page.on("request", requestListener);
  page.on("response", responseListener);

  const startNav = Date.now();
  await page.goto(targetUrl, { waitUntil: "networkidle" });
  const navDuration = Date.now() - startNav;

  page.off("request", requestListener);
  page.off("response", responseListener);

  // Extract browser performance timing metrics
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const paints = performance.getEntriesByType("paint");
    const fcpEntry = paints.find((p) => p.name === "first-contentful-paint");

    return {
      ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : 0,
      fcp: fcpEntry ? Math.round(fcpEntry.startTime) : 0,
      domReady: nav ? Math.round(nav.domContentLoadedEventEnd - nav.responseStart) : 0,
      load: nav ? Math.round(nav.loadEventEnd - nav.startTime) : 0,
    };
  });

  return {
    page: name,
    url: targetUrl,
    ttfbMs: timing.ttfb > 0 ? timing.ttfb : 0,
    fcpMs: timing.fcp > 0 ? timing.fcp : 0,
    domReadyMs: timing.domReady > 0 ? timing.domReady : 0,
    loadMs: timing.load > 0 ? timing.load : navDuration,
    requestsCount: requests,
    transferSizeKb: Math.round(totalBytes / 1024),
  };
}

async function runBenchmark() {
  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  console.log(`\n======================================================`);
  console.log(`  EdgeXI Performance Benchmark with Playwright`);
  console.log(`  Target: ${baseUrl}`);
  console.log(`======================================================\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // 1. Initial Login
  console.log(`[1/5] Navigating to /login...`);
  const loginStart = Date.now();
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  console.log(`  Login page loaded in ${Date.now() - loginStart}ms`);

  console.log(`  Submitting credentials for ndnd15237@gmail.com...`);
  await page.fill('input[type="email"]', "ndnd15237@gmail.com");
  await page.fill('input[type="password"]', "EdgeXI#2026!");
  
  const authStart = Date.now();
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  console.log(`  Authentication & redirect completed in ${Date.now() - authStart}ms`);

  const results: PerfResult[] = [];

  // 2. Dashboard
  console.log(`\n[2/5] Benchmarking Dashboard (/)...\n`);
  const dashRes = await measurePagePerformance(page, `${baseUrl}/`, "Dashboard");
  results.push(dashRes);

  // 3. Picks Page
  console.log(`[3/5] Benchmarking Picks (/picks)...\n`);
  const picksRes = await measurePagePerformance(page, `${baseUrl}/picks`, "Picks");
  results.push(picksRes);

  // 4. Matches Page
  console.log(`[4/5] Benchmarking Matches (/matches)...\n`);
  const matchesRes = await measurePagePerformance(page, `${baseUrl}/matches`, "Matches");
  results.push(matchesRes);

  // 5. History Page
  console.log(`[5/5] Benchmarking History (/history)...\n`);
  const historyRes = await measurePagePerformance(page, `${baseUrl}/history`, "History");
  results.push(historyRes);

  // 6. Settings Page
  console.log(`[6/6] Benchmarking Settings (/settings)...\n`);
  const settingsRes = await measurePagePerformance(page, `${baseUrl}/settings`, "Settings");
  results.push(settingsRes);

  // 7. Measure Client-Side Navigation (SPA Transition)
  console.log(`\nMeasuring Client-Side SPA Navigation transitions...`);
  const spaTransitions: { from: string; to: string; durationMs: number }[] = [];

  // Dashboard -> Picks via client link
  let t0 = Date.now();
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/picks", { timeout: 10000 }),
    page.click('a[href="/picks"]'),
  ]);
  spaTransitions.push({ from: "Dashboard", to: "Picks", durationMs: Date.now() - t0 });

  // Picks -> Matches via client link
  t0 = Date.now();
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/matches", { timeout: 10000 }),
    page.click('a[href="/matches"]'),
  ]);
  spaTransitions.push({ from: "Picks", to: "Matches", durationMs: Date.now() - t0 });

  // Matches -> History via client link
  t0 = Date.now();
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/history", { timeout: 10000 }),
    page.click('a[href="/history"]'),
  ]);
  spaTransitions.push({ from: "Matches", to: "History", durationMs: Date.now() - t0 });

  // History -> Dashboard via client link
  t0 = Date.now();
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/", { timeout: 10000 }),
    page.click('a[href="/"]'),
  ]);
  spaTransitions.push({ from: "History", to: "Dashboard", durationMs: Date.now() - t0 });

  await browser.close();

  // Print Summary Table
  console.log(`\n========================================================================================`);
  console.log(`                         FULL PAGE LOAD BENCHMARK (COLD/NAV)                           `);
  console.log(`========================================================================================`);
  console.log(
    `| ${"Page".padEnd(14)} | ${"TTFB".padStart(8)} | ${"FCP".padStart(8)} | ${"DOM Ready".padStart(11)} | ${"Load Complete".padStart(13)} | ${"Requests".padStart(8)} | ${"Transfer".padStart(10)} |`
  );
  console.log(`|----------------|----------|----------|-------------|---------------|----------|------------|`);
  for (const r of results) {
    console.log(
      `| ${r.page.padEnd(14)} | ${(r.ttfbMs + " ms").padStart(8)} | ${(r.fcpMs + " ms").padStart(8)} | ${(r.domReadyMs + " ms").padStart(11)} | ${(r.loadMs + " ms").padStart(13)} | ${String(r.requestsCount).padStart(8)} | ${(r.transferSizeKb + " KB").padStart(10)} |`
    );
  }
  console.log(`========================================================================================\n`);

  console.log(`======================================================`);
  console.log(`          CLIENT-SIDE (SPA) TRANSITION SPEEDS         `);
  console.log(`======================================================`);
  for (const t of spaTransitions) {
    console.log(`  ${t.from} -> ${t.to}: ${t.durationMs} ms`);
  }
  console.log(`======================================================\n`);

  if (consoleErrors.length > 0) {
    console.log(`Browser Console Errors (${consoleErrors.length}):`);
    consoleErrors.forEach((e, i) => console.log(`  [${i + 1}] ${e}`));
  } else {
    console.log(`✓ Zero browser console errors detected across all tested routes.`);
  }

  process.exit(0);
}

runBenchmark().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});

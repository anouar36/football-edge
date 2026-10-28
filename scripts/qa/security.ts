import "../env";
/**
 * HTTP security checks against a running server (npm run dev or npm run start).
 *   QA_BASE_URL=http://localhost:3000 QA_EMAIL=you@example.com QA_PASSWORD=... npm run qa:security
 * QA_EMAIL must be in ALLOWED_EMAILS with an account. Uses a few sign-in attempts from made-up IPs
 * (x-forwarded-for) so your own IP is not rate-limited. Also scans .next/static for secrets.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { check, done, section } from "./harness";

const base = (process.env.QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const email = process.env.QA_EMAIL ?? "";
const password = process.env.QA_PASSWORD ?? "";
let ipSeq = Math.floor(Math.random() * 200);
const freshIp = () => `198.18.${Math.floor(Math.random() * 250)}.${(ipSeq = (ipSeq + 1) % 250) + 1}`;

async function req(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  return fetch(base + path, { ...init, headers, redirect: "manual" });
}
const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify(body) });
const authPost = (path: string, body: unknown, ip = freshIp()) => req(`/api/auth${path}`, { ...json(body), headers: { "content-type": "application/json", origin: base, "x-forwarded-for": ip } });

(async () => {
  console.log(`server: ${base}`);

  section("1. Every page without a session redirects to /login");
  for (const p of ["/", "/picks", "/matches", "/matches/E0-2026-01-01-A-B", "/slip", "/history", "/history?view=placed", "/settings", "/nope"]) {
    const r = await req(p);
    const loc = r.headers.get("location") ?? "";
    const want = p === "/" ? "/login" : `/login?next=${encodeURIComponent(p)}`;
    check(`GET ${p} → 307 ${want}`, r.status === 307 && new URL(loc, base).pathname + new URL(loc, base).search === want, `${r.status} ${loc}`);
  }
  check("GET /login → 200 without a session", (await req("/login")).status === 200);

  section("2. Every API without a session answers 401");
  const apis: [string, string][] = [
    ["POST", "/api/run"], ["PUT", "/api/settings"], ["GET", "/api/settings"], ["PATCH", "/api/picks/x"],
    ["POST", "/api/matches/x/picks"], ["POST", "/api/matches/x/odds-image"], ["POST", "/api/tickets"], ["POST", "/api/ticket/explain"],
  ];
  for (const [method, p] of apis) {
    const r = await req(p, { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });
    check(`${method} ${p} → 401`, r.status === 401, String(r.status));
  }
  const fake = await req("/api/settings", { method: "PUT", cookie: "better-auth.session_token=forged.value; __Secure-better-auth.session_token=forged.value", headers: { "content-type": "application/json" }, body: "{}" });
  check("a forged session cookie is refused", fake.status === 401, String(fake.status));

  section("3. Cron endpoint and CRON_SECRET");
  const cron = (auth?: string) => req("/api/cron/daily", { headers: auth ? { authorization: auth } : {} });
  check("no Authorization header → 401", (await cron()).status === 401);
  check("wrong secret → 401", (await cron("Bearer wrong-secret")).status === 401);
  check("secret without 'Bearer ' → 401", (await cron(process.env.CRON_SECRET ?? "x")).status === 401);
  if (process.env.QA_RUN_CRON === "1" && process.env.CRON_SECRET) {
    const ok = await cron(`Bearer ${process.env.CRON_SECRET}`);
    check("right secret → runs (200, or 409 when a run is already going)", ok.status === 200 || ok.status === 409, String(ok.status));
  } else console.log("  · right secret not called (it runs the whole pipeline); set QA_RUN_CRON=1 to include it");

  section("4. Who can get in (checked on the server)");
  const notAllowed = await authPost("/sign-up/email", { name: "Intruder", email: "intruder@example.org", password: "long-enough-password" });
  check("sign-up with an email outside ALLOWED_EMAILS → 403 EMAIL_NOT_ALLOWED", notAllowed.status === 403 && (await notAllowed.json()).code === "EMAIL_NOT_ALLOWED");
  const signInOther = await authPost("/sign-in/email", { email: "intruder@example.org", password: "whatever-password" });
  check("sign-in with an email outside ALLOWED_EMAILS → 403", signInOther.status === 403);
  const caseTrick = await authPost("/sign-up/email", { name: "x", email: "INTRUDER@example.org ", password: "long-enough-password" });
  check("case and spaces do not get around the list", caseTrick.status === 403 || caseTrick.status === 400, String(caseTrick.status));
  if (email) {
    const closed = await authPost("/sign-up/email", { name: "Second", email, password: "another-password-123" });
    check("sign-up once an account exists → 403 (SIGN_UP_CLOSED or USER_ALREADY_EXISTS)", closed.status === 403 || closed.status === 422, String(closed.status));
    const wrong = await authPost("/sign-in/email", { email, password: "definitely-wrong-password" });
    const unknown = await authPost("/sign-in/email", { email: email.replace("@", "+nobody@"), password: "definitely-wrong-password" });
    check("wrong password → 401 with the generic message", wrong.status === 401 && (await wrong.json()).code === "INVALID_EMAIL_OR_PASSWORD");
    check("unknown allowed-looking email → refused (403 not allowed, or 401)", unknown.status === 403 || unknown.status === 401, String(unknown.status));
  }

  section("5. Rate limit on sign-in (5 per 5 minutes per IP)");
  const ip = freshIp();
  const codes: number[] = [];
  for (let i = 0; i < 7; i++) codes.push((await authPost("/sign-in/email", { email: email || "nobody@example.com", password: `wrong-${i}-password` }, ip)).status);
  check("6th attempt from one IP → 429", codes.slice(0, 5).every((c) => c !== 429) && codes[5] === 429 && codes[6] === 429, codes.join(" "));
  const rotated = await authPost("/sign-in/email", { email: email || "nobody@example.com", password: "wrong-again-password" }, freshIp());
  console.log(`  · a different x-forwarded-for gets a fresh budget (${rotated.status}): the limit relies on the host setting this header (Vercel does)`);

  if (!email || !password) {
    console.log("\n(QA_EMAIL / QA_PASSWORD not set: signed-in checks skipped)");
  } else {
    const signIn = await authPost("/sign-in/email", { email, password });
    const setCookie = signIn.headers.getSetCookie();
    const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
    const session = setCookie.find((c) => /session_token=/.test(c)) ?? "";
    check("sign-in works", signIn.status === 200 && Boolean(cookie), String(signIn.status));
    check("session cookie is HttpOnly and SameSite=Lax", /HttpOnly/i.test(session) && /SameSite=Lax/i.test(session));
    check("session cookie is Secure when served over HTTPS / in production", /Secure/i.test(session) || process.env.QA_EXPECT_SECURE !== "1", /Secure/i.test(session) ? "Secure" : "not Secure (dev or plain http)");

    section("6. Open redirect after sign-in");
    for (const next of ["//evil.example/x", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "/login?next=//evil.example"]) {
      const r = await req(`/login?next=${encodeURIComponent(next)}`, { cookie });
      const loc = r.headers.get("location") ?? "";
      check(`next=${next} stays on this site`, r.status === 307 && new URL(loc, base).origin === new URL(base).origin, loc);
    }

    section("7. Input validation (signed in)");
    const put = (body: unknown) => req("/api/settings", { method: "PUT", cookie, headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
    check("settings: body that is not JSON → 400", (await put("not json")).status === 400);
    const valid = { bankroll: 1000, currency: "MAD", kellyFraction: 0.25, maxStakePct: 0.02, minEdge: 0.04, minProb: 0.3, minOdds: 1.4, maxOdds: 4.5, maxPicksPerDay: 8, modelWeight: 0.5, leagues: "E0,SP1", daysAhead: 2, language: "ar", useWebSearch: true, llmProvider: "anthropic", llmModel: null, displayName: "QA" };
    for (const [label, patch] of [
      ["negative bankroll", { bankroll: -5 }], ["bankroll not finite", { bankroll: "1e999" }], ["max stake 50%", { maxStakePct: 0.5 }], ["Kelly fraction 2", { kellyFraction: 2 }],
      ["min odds ≥ max odds", { minOdds: 3, maxOdds: 2 }], ["SQL in leagues", { leagues: "E0;DROP TABLE picks" }], ["unknown provider", { llmProvider: "evil" }],
      ["model id with spaces", { llmModel: "a b" }], ["name too long", { displayName: "x".repeat(41) }], ["days ahead 30", { daysAhead: 30 }],
    ] as [string, Record<string, unknown>][]) {
      const r = await put({ ...valid, ...patch });
      check(`settings: ${label} → 400`, r.status === 400, String(r.status));
    }
    const patch = (id: string, body: unknown) => req(`/api/picks/${encodeURIComponent(id)}`, { method: "PATCH", cookie, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    check("pick status: unknown pick → 404", (await patch("no-such-pick", { status: "PLACED" })).status === 404);
    check("pick status: status WON → 400", (await patch("no-such-pick", { status: "WON" })).status === 400);
    const pickPost = (body: unknown) => req("/api/matches/no-such-match/picks", { method: "POST", cookie, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    check("screenshot pick: unknown market key → 400", (await pickPost({ key: "EVIL:KEY", odds: 2, status: "PLACED" })).status === 400);
    check("screenshot pick: odds 1.0 → 400", (await pickPost({ key: "1X2:HOME", odds: 1, status: "PLACED" })).status === 400);
    check("screenshot pick: odds as text → 400", (await pickPost({ key: "1X2:HOME", odds: "2.1", status: "PLACED" })).status === 400);
    check("screenshot pick: unknown match → 404", (await pickPost({ key: "1X2:HOME", odds: 2.1, status: "PLACED" })).status === 404);
    const upload = (form: FormData) => req("/api/matches/no-such-match/odds-image", { method: "POST", cookie, body: form });
    const f0 = new FormData();
    check("odds image: no file → 400", (await upload(f0)).status === 400);
    const f1 = new FormData();
    f1.append("image", new Blob(["<svg onload=alert(1)>"], { type: "image/png" }), "x.png");
    check("odds image: SVG/text sent as image/png → 415 (bytes are checked)", (await upload(f1)).status === 415);
    const f2 = new FormData();
    f2.append("image", new Blob([new Uint8Array(5 * 1024 * 1024 + 10)], { type: "image/png" }), "big.png");
    check("odds image: over 5 MB → 413", (await upload(f2)).status === 413);
    for (const p of ["/matches/%E0%A4%A", "/matches/a%25b", "/matches/%25", "/matches/" + "x".repeat(2000)]) {
      const r = await req(p, { cookie });
      check(`GET ${p.slice(0, 40)}${p.length > 40 ? "…" : ""} → 400 or 404, never 500`, r.status === 400 || r.status === 404, String(r.status));
    }
    const html = await (await req("/settings", { cookie })).text();
    check("settings page never contains the value of an API key or secret", !secretsIn(html).length, secretsIn(html).join(", "));
  }

  section("8. Response headers");
  const h = (await req("/login")).headers;
  check("X-Powered-By is not sent", !h.get("x-powered-by"), h.get("x-powered-by") ?? "");
  check("pages cannot be framed (X-Frame-Options or CSP frame-ancestors)", /deny|sameorigin/i.test(h.get("x-frame-options") ?? "") || /frame-ancestors/.test(h.get("content-security-policy") ?? ""));
  check("X-Content-Type-Options: nosniff", h.get("x-content-type-options") === "nosniff");

  section("9. Secrets in the browser bundle (.next/static)");
  const dir = process.env.QA_NEXT_DIR ?? ".next";
  const files = walk(join(dir, "static"));
  const hits = files.flatMap((f) => secretsIn(readFileSync(f, "utf8")).map((s) => `${s} in ${f}`));
  check(`${files.length} files in ${dir}/static hold no secret value`, files.length > 0 && hits.length === 0, hits.slice(0, 3).join("; "));
  done();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

/** Names of the secret env vars whose value appears in `text` (values are never printed). */
function secretsIn(text: string) {
  const names = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "CRON_SECRET", "BETTER_AUTH_SECRET", "API_FOOTBALL_KEY"];
  const found = names.filter((n) => (process.env[n] ?? "").length >= 12 && text.includes(process.env[n]!));
  const db = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).password : "";
  if (db.length >= 8 && text.includes(db)) found.push("DATABASE_URL password");
  return found;
}

function walk(d: string): string[] {
  try {
    return readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : /\.(js|css|json|html|txt)$/.test(n) ? [join(d, n)] : []));
  } catch {
    return [];
  }
}

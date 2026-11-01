import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createConnection } from "node:net";
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const base = new URL(process.env.QA_BASE_URL || "http://127.0.0.1:3104");
const local = ["127.0.0.1", "localhost"];
if (!local.includes(base.hostname) || base.protocol !== "http:" || base.port !== "3104") {
  throw new Error("Refusing non-local security target");
}
for (const name of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) {
  const db = new URL(process.env[name] || "");
  if (!local.includes(db.hostname) || db.pathname !== "/fe004_ci" ||
      !["5432", "55444"].includes(db.port)) {
    throw new Error("Refusing unexpected database");
  }
}
if (!process.env.QA_EMAIL || !process.env.QA_PASSWORD) {
  throw new Error("QA credentials required; authenticated checks cannot be skipped");
}
if (process.env.QA_RUN_CRON === "1") {
  throw new Error("Full cron execution is not part of security checks");
}

const busy = await new Promise(resolve => {
  const socket = createConnection({ host: "127.0.0.1", port: 3104 });
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => { socket.destroy(); resolve(false); });
  socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
});
if (busy) throw new Error("Port 3104 already occupied; no server was stopped");

const evidence = resolve(process.env.FE004_EVIDENCE_DIR || ".fe004-evidence/security");
mkdirSync(evidence, { recursive: true });
const log = createWriteStream(resolve(evidence, "server.log"));
const env = {
  ...process.env,
  NODE_ENV: "production",
  BETTER_AUTH_URL: base.origin,
  QA_BASE_URL: base.origin,
  QA_RUN_CRON: "0",
  NODE_OPTIONS: "--import=" + resolve("scripts/ci/local-only-fetch.mjs"),
};
const server = spawn(process.execPath, [
  require.resolve("next/dist/bin/next"),
  "start", "-p", "3104", "-H", "127.0.0.1"
], { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
let serverError;
server.on("error", error => { serverError = error; });
server.stdout.pipe(log, { end: false });
server.stderr.pipe(log, { end: false });

function stopServer() {
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
}
process.once("SIGINT", () => { stopServer(); process.exit(130); });
process.once("SIGTERM", () => { stopServer(); process.exit(143); });

try {
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline) {
    if (serverError || server.exitCode !== null) {
      throw new Error("Security server failed to start; inspect server.log");
    }
    try {
      const response = await fetch(base.origin + "/login", {
        signal: AbortSignal.timeout(3000), redirect: "manual"
      });
      await response.arrayBuffer();
      if (response.status === 200) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Security server readiness timeout");

  const signup = await fetch(base.origin + "/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base.origin },
    body: JSON.stringify({
      name: "CI synthetic user",
      email: env.QA_EMAIL,
      password: env.QA_PASSWORD
    }),
    signal: AbortSignal.timeout(15000)
  });
  let body;
  try { body = await signup.json(); } catch {}
  if (signup.status !== 200) {
    const expected = ["SIGN_UP_CLOSED", "USER_ALREADY_EXISTS", "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"];
    if (!expected.includes(body?.code)) {
      throw new Error("Synthetic account setup failed: HTTP " + signup.status);
    }
  }

  console.log("RUN: authenticated security checks against disposable local server");
  const result = spawnSync("npm", ["run", "qa:security"], {
    env, encoding: "utf8", timeout: 150000
  });
  const output = (result.stdout || "") + (result.stderr || "");
  writeFileSync(resolve(evidence, "qa-security.log"), output);
  const skipped = output.includes("signed-in checks skipped");
  const passed = result.status === 0 && !result.error && !skipped;
  writeFileSync(resolve(evidence, "summary.json"), JSON.stringify({
    check: "qa:security",
    exitCode: result.status,
    authenticatedChecksSkipped: skipped,
    passed
  }, null, 2) + "\n");
  console.log(output.split("\n").slice(-40).join("\n"));
  if (!passed) throw new Error("Security checks failed; inspect saved evidence");
  console.log("PASS: qa:security");
} finally {
  stopServer();
  log.end();
}

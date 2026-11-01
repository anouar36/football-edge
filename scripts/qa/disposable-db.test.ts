import assert from "node:assert/strict";
import { assertDisposableDatabase } from "../disposable-db";

const local = "postgresql://qa:synthetic@127.0.0.1:55444/fe004_ci";
const cases: Array<{
  name: string;
  env: Record<string, string>;
  allowed: boolean;
}> = [
  { name: "local CI database", env: { DATABASE_URL: local }, allowed: true },
  { name: "matching direct URL", env: {
    DATABASE_URL: local, DATABASE_URL_UNPOOLED: local
  }, allowed: true },
  { name: "missing URL", env: {}, allowed: false },
  { name: "invalid URL", env: { DATABASE_URL: "invalid" }, allowed: false },
  { name: "ordinary local database", env: {
    DATABASE_URL: "postgresql://qa:synthetic@127.0.0.1/football"
  }, allowed: false },
  { name: "remote database despite old override", env: {
    DATABASE_URL: "postgresql://qa:synthetic@db.example.invalid/qa_test",
    QA_ALLOW_REMOTE_DB: "1"
  }, allowed: false },
  { name: "remote direct URL", env: {
    DATABASE_URL: local,
    DATABASE_URL_UNPOOLED: "postgresql://qa:synthetic@db.example.invalid/qa_test"
  }, allowed: false },
  { name: "different direct database", env: {
    DATABASE_URL: local,
    DATABASE_URL_UNPOOLED: "postgresql://qa:synthetic@127.0.0.1:55444/other_test"
  }, allowed: false },
  { name: "different direct port", env: {
    DATABASE_URL: local,
    DATABASE_URL_UNPOOLED: "postgresql://qa:synthetic@127.0.0.1:55445/fe004_ci"
  }, allowed: false },
  { name: "production deployment", env: {
    DATABASE_URL: local, VERCEL_ENV: "production"
  }, allowed: false },
];

const keys = [
  "DATABASE_URL", "DATABASE_URL_UNPOOLED",
  "VERCEL_ENV", "QA_ALLOW_REMOTE_DB"
];
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));

try {
  for (const test of cases) {
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, test.env);
    if (test.allowed) {
      assert.doesNotThrow(() => assertDisposableDatabase(), test.name);
    } else {
      assert.throws(() => assertDisposableDatabase(), test.name);
    }
    console.log("PASS:", test.name);
  }
  console.log(`${cases.length} passed; no database connections opened.`);
} finally {
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

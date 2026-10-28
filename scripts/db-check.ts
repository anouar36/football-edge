import "./env";
/**
 * Checks the database connection without printing the password.
 *   npm run db:check            connect, print the host, Postgres version and tables
 *   npm run db:check -- --tables   also fail unless every table of schema.ts exists (run by db:push)
 */
import type { TLSSocket } from "node:tls";
import { Client } from "pg";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describeDb, directPgConfig, pgConfig, type PgConfig } from "../src/lib/db-config";
import { ensureSchema } from "../src/lib/bootstrap";
import * as schema from "../src/lib/schema";

const expected = Object.values(schema)
  .filter((v) => is(v, PgTable))
  .map((t) => getTableConfig(t).name)
  .sort();

async function check(label: string, c: PgConfig) {
  const client = new Client({ connectionString: c.connectionString, ssl: c.ssl, connectionTimeoutMillis: 15_000 });
  await client.connect();
  try {
    const { rows } = await client.query<{ v: string }>("select current_setting('server_version') v");
    // Our own socket: behind Neon's pooler, pg_stat_ssl would describe the pooler's connection instead.
    const socket = (client as unknown as { connection: { stream: Partial<TLSSocket> } }).connection.stream;
    const tls = socket.encrypted ? (socket.authorized ? "on, certificate verified" : "on, certificate NOT verified") : "off";
    console.log(`✓ Connected (${label}): ${describeDb(c)} · Postgres ${rows[0].v} · TLS ${tls}`);
    return client;
  } catch (e) {
    await client.end();
    throw e;
  }
}

(async () => {
  const tables = process.argv.includes("--tables");
  const pooled = pgConfig();
  const client = await check("DATABASE_URL", pooled);
  try {
    if (process.env.DATABASE_URL_UNPOOLED?.trim()) await (await check("DATABASE_URL_UNPOOLED", directPgConfig())).end();
    if (tables) {
      // The ALTER TABLE ... IF NOT EXISTS upgrades the app also runs on its first request.
      await ensureSchema(client);
    }
    const { rows } = await client.query<{ name: string }>("select table_name as name from information_schema.tables where table_schema = 'public' order by 1");
    const have = new Set(rows.map((r) => r.name));
    const missing = expected.filter((t) => !have.has(t));
    console.log(`  tables: ${rows.map((r) => r.name).join(", ") || "(none)"}`);
    if (missing.length) {
      console.log(`  missing: ${missing.join(", ")}${tables ? "" : "  → run npm run db:push"}`);
      if (tables) process.exitCode = 1;
    } else console.log(`✓ Tables ready (${expected.length} tables)`);
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(`✗ ${(e as Error).name === "DatabaseConfigError" ? "" : "Cannot connect: "}${(e as Error).message}`);
  process.exitCode = 1;
});

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import { ensureSchema } from "./bootstrap";
import { pgConfig } from "./db-config";
import * as schema from "./schema";
import { matches, picks, settings, type PickWithMatch } from "./schema";

const g = globalThis as unknown as { pool?: Pool; db?: NodePgDatabase<typeof schema> };

function connect() {
  const { connectionString, ssl } = pgConfig();
  // Idle connections stay open 30 s (pg's default is 10 s): a new TLS connection to Neon costs
  // several round trips, and clicks through the dashboard are usually more than 10 s apart.
  const pool = new Pool({ connectionString, ssl, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000 });
  // On Vercel Fluid compute: keeps the instance alive until idle connections are closed cleanly. No-op elsewhere.
  attachDatabasePool(pool);
  return { pool, db: drizzle(pool, { schema }) };
}

export function getDb() {
  if (!g.db) {
    const c = connect();
    g.pool = c.pool;
    g.db = c.db;
  }
  return g.db;
}

export async function closeDb() {
  await g.pool?.end();
  g.pool = undefined;
  g.db = undefined;
}

/** getDb() after the schema upgrades in bootstrap.ts have run. */
export async function getReadyDb() {
  const db = getDb();
  await ensureSchema(g.pool!);
  return db;
}

export async function getSettings() {
  const db = await getReadyDb();
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (row) return row;
  const [created] = await db.insert(settings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(settings).where(eq(settings.id, 1)))[0];
}

/** Picks joined with their match. */
export async function picksWithMatch(where?: SQL, order: "kickoffAsc" | "kickoffDesc" = "kickoffAsc"): Promise<PickWithMatch[]> {
  const rows = await getDb()
    .select({ pick: picks, match: matches })
    .from(picks)
    .innerJoin(matches, eq(picks.matchId, matches.id))
    .where(where ?? and())
    .orderBy(order === "kickoffAsc" ? asc(matches.kickoff) : desc(matches.kickoff), desc(picks.edge));
  return rows.map((r) => ({ ...r.pick, match: r.match }));
}

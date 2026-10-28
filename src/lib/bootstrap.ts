import { createHash } from "node:crypto";
import type { ClientBase, Pool } from "pg";

/**
 * Columns added after the first release. `npm run db:push` creates them too,
 * but these let an existing database (e.g. on Neon) upgrade itself on the
 * first request. Keep them in sync with schema.ts.
 */
const UPGRADES = [
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS llm_provider text NOT NULL DEFAULT 'anthropic'`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS llm_model text`,
  `CREATE TABLE IF NOT EXISTS team_logos (
    name text NOT NULL,
    league text NOT NULL,
    logo_url text,
    source text NOT NULL,
    checked_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT team_logos_name_league_pk PRIMARY KEY (name, league)
  )`,
  `CREATE TABLE IF NOT EXISTS league_logos (code text PRIMARY KEY, logo_url text NOT NULL)`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT 'Anouar'`,
  `CREATE TABLE IF NOT EXISTS tickets (
    id text PRIMARY KEY,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    stake double precision NOT NULL,
    total_odds double precision NOT NULL,
    prob double precision NOT NULL,
    ev double precision NOT NULL,
    status text NOT NULL DEFAULT 'PENDING',
    profit double precision
  )`,
  `CREATE INDEX IF NOT EXISTS tickets_created_idx ON tickets (created_at)`,
  `CREATE TABLE IF NOT EXISTS ticket_legs (
    id text PRIMARY KEY,
    ticket_id text NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    match_id text NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    key text NOT NULL,
    label text NOT NULL,
    odds double precision NOT NULL,
    prob double precision NOT NULL,
    result text NOT NULL DEFAULT 'PENDING'
  )`,
  `CREATE INDEX IF NOT EXISTS ticket_legs_ticket_idx ON ticket_legs (ticket_id)`,
  `CREATE INDEX IF NOT EXISTS ticket_legs_match_idx ON ticket_legs (match_id)`,
  `ALTER TABLE picks ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'MODEL'`,
  // Login (Better Auth). Constraint names match what db:push creates.
  `CREATE TABLE IF NOT EXISTS auth_users (
    id text PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL CONSTRAINT auth_users_email_unique UNIQUE,
    email_verified boolean NOT NULL DEFAULT false,
    image text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    id text PRIMARY KEY,
    token text NOT NULL CONSTRAINT auth_sessions_token_unique UNIQUE,
    user_id text NOT NULL CONSTRAINT auth_sessions_user_id_auth_users_id_fk REFERENCES auth_users(id) ON DELETE CASCADE,
    expires_at timestamp with time zone NOT NULL,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id)`,
  `CREATE TABLE IF NOT EXISTS auth_accounts (
    id text PRIMARY KEY,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id text NOT NULL CONSTRAINT auth_accounts_user_id_auth_users_id_fk REFERENCES auth_users(id) ON DELETE CASCADE,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp with time zone,
    refresh_token_expires_at timestamp with time zone,
    scope text,
    password text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS auth_accounts_user_idx ON auth_accounts (user_id)`,
  `CREATE TABLE IF NOT EXISTS auth_verifications (
    id text PRIMARY KEY,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS auth_verifications_identifier_idx ON auth_verifications (identifier)`,
  `CREATE TABLE IF NOT EXISTS auth_rate_limits (
    id text PRIMARY KEY,
    key text NOT NULL CONSTRAINT auth_rate_limits_key_unique UNIQUE,
    count integer NOT NULL,
    last_request bigint NOT NULL
  )`,
  // Lets runDaily tell a run in progress from one that was stopped (see pipeline/daily.ts).
  `ALTER TABLE runs ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now()`,
  // One per WHERE / ORDER BY the pages use (lib/data.ts).
  `CREATE INDEX IF NOT EXISTS picks_result_status_idx ON picks (result, status)`,
  `CREATE INDEX IF NOT EXISTS matches_status_kickoff_idx ON matches (status, kickoff)`,
  `CREATE INDEX IF NOT EXISTS runs_kind_started_idx ON runs (kind, started_at)`,
  `CREATE INDEX IF NOT EXISTS runs_started_idx ON runs (started_at)`,
  `CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets (status)`,
];

/** Changes whenever UPGRADES changes. Stored in schema_version once the upgrades have run. */
const VERSION = createHash("sha256").update(UPGRADES.join("\n;\n")).digest("hex").slice(0, 16);

const g = globalThis as unknown as { schemaReady?: { version: string; done: Promise<void> } };

/**
 * Runs once per process; retried on the next call if it failed. Keyed by VERSION because `npm run dev`
 * keeps globalThis across code reloads: a newly added upgrade still runs.
 *
 * On a cold start this is one small SELECT: the upgrades are skipped when schema_version already holds
 * this VERSION. Otherwise they all go in one round trip (the simple query protocol runs several
 * statements in one implicit transaction), instead of one round trip and one table lock per statement.
 */
export function ensureSchema(db: Pool | ClientBase): Promise<void> {
  if (g.schemaReady?.version !== VERSION) {
    const done = (async () => {
      const current = await db.query<{ version: string }>("SELECT version FROM schema_version WHERE id = 1").catch(() => null);
      if (current?.rows[0]?.version === VERSION) return;
      await db.query(
        [
          ...UPGRADES,
          `CREATE TABLE IF NOT EXISTS schema_version (id integer PRIMARY KEY, version text NOT NULL, applied_at timestamp with time zone NOT NULL DEFAULT now())`,
          `INSERT INTO schema_version (id, version) VALUES (1, '${VERSION}') ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = now()`,
        ].join(";\n")
      );
    })().catch((e) => {
      g.schemaReady = undefined;
      throw e;
    });
    g.schemaReady = { version: VERSION, done };
  }
  return g.schemaReady.done;
}

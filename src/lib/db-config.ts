import type { ConnectionOptions } from "node:tls";

/**
 * Connection settings shared by every database connection: the app pool (db.ts, which
 * bootstrap.ts also uses), the scripts and drizzle.config.ts. TLS is decided here and
 * passed as `ssl`, never left to the URL's sslmode: pg reads sslmode=require as
 * verify-full today and warns that the meaning changes in pg 9.
 */

/** DATABASE_URL is missing, not a postgres URL, or still the value from .env.example. */
export class DatabaseConfigError extends Error {
  name = "DatabaseConfigError";
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);
/** URL parameters that choose TLS; removed from the URL so the `ssl` option below is the only rule. */
const TLS_PARAMS = ["sslmode", "ssl", "uselibpqcompat", "sslcert", "sslkey", "sslrootcert"];

export interface PgConfig {
  /** The URL without its TLS parameters. */
  connectionString: string;
  /** false = no TLS (local database); otherwise the certificate and host name are verified unless sslmode=no-verify. */
  ssl: false | ConnectionOptions;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function isPlaceholder(u: URL) {
  const host = u.hostname.toLowerCase();
  return host === "host" || /^ep-x+([.-]|$)/.test(host) || (u.username === "user" && u.password === "password");
}

/** Parses and checks a postgres URL (DATABASE_URL by default). Throws DatabaseConfigError with a message that says what to do. */
export function pgConfig(url = process.env.DATABASE_URL, name = "DATABASE_URL"): PgConfig {
  if (!url?.trim()) throw new DatabaseConfigError(`${name} is not set. Put your Neon connection string in .env (Neon console → Connect).`);
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    throw new DatabaseConfigError(`${name} is not a valid URL. It should look like postgresql://user:password@host/dbname.`);
  }
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") throw new DatabaseConfigError(`${name} must start with postgresql://`);
  if (isPlaceholder(u)) {
    throw new DatabaseConfigError(`${name} is still the example value from .env.example. Put your Neon connection string in .env (Neon console → Connect), then restart.`);
  }

  const sslmode = u.searchParams.get("sslmode")?.toLowerCase();
  for (const p of TLS_PARAMS) u.searchParams.delete(p);
  const local = LOCAL_HOSTS.has(u.hostname.toLowerCase());
  const ssl: PgConfig["ssl"] =
    sslmode === "disable" || (local && !sslmode)
      ? false
      : sslmode === "no-verify"
        ? { rejectUnauthorized: false }
        : // verify-full: Neon's certificates are signed by a public CA, so Node's default CA list is enough.
          { rejectUnauthorized: true };

  return {
    connectionString: u.toString(),
    ssl,
    host: u.hostname,
    port: Number(u.port) || 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.slice(1)),
  };
}

/** For migrations (drizzle-kit): the direct connection when DATABASE_URL_UNPOOLED is set, else DATABASE_URL. */
export function directPgConfig(): PgConfig {
  return process.env.DATABASE_URL_UNPOOLED?.trim() ? pgConfig(process.env.DATABASE_URL_UNPOOLED, "DATABASE_URL_UNPOOLED") : pgConfig();
}

/** "ep-cool-name-pooler.eu-central-1.aws.neon.tech/neondb": what scripts print instead of the URL (no password). */
export const describeDb = (c: PgConfig) => `${c.host}${c.port === 5432 ? "" : `:${c.port}`}/${c.database}`;

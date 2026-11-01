import { pgConfig } from "../src/lib/db-config";

/** Validates configuration only; never opens a database connection. */
export function assertDisposableDatabase() {
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("Refusing destructive script in production.");
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const names = ["DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const;

  for (const name of names) {
    const value = process.env[name];
    if (name === "DATABASE_URL_UNPOOLED" && !value?.trim()) continue;
    const config = pgConfig(value, name);

    if (!localHosts.has(config.host.toLowerCase())) {
      throw new Error("Refusing destructive script: remote database is not allowed.");
    }

    if (!/_(test|ci|demo|benchmark)$/.test(config.database)) {
      throw new Error("Use a disposable database ending in _test, _ci, _demo or _benchmark.");
    }

    if (name === "DATABASE_URL_UNPOOLED") {
      const primary = pgConfig();
      if (
        config.host !== primary.host ||
        config.port !== primary.port ||
        config.database !== primary.database
      ) {
        throw new Error("Database URLs must target the same disposable database.");
      }
    }
  }
}

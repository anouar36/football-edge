try { process.loadEnvFile(".env"); } catch { /* no .env */ }
import { defineConfig } from "drizzle-kit";
import { directPgConfig } from "./src/lib/db-config";

// Same TLS rule as the app (no sslmode in the URL), on the direct connection when DATABASE_URL_UNPOOLED is set.
const { host, port, user, password, database, ssl } = directPgConfig();

export default defineConfig({
  schema: "./src/lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { host, port, user, password, database, ssl },
});

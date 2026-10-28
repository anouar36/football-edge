// Load .env when running scripts locally (GitHub Actions passes real env vars).
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env file */
}

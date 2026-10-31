import { bigint, boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "./id";

/** Single row (id = 1) holding the staking + filtering rules. */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  bankroll: doublePrecision("bankroll").notNull().default(1000),
  currency: text("currency").notNull().default("MAD"),
  kellyFraction: doublePrecision("kelly_fraction").notNull().default(0.25),
  maxStakePct: doublePrecision("max_stake_pct").notNull().default(0.02),
  minEdge: doublePrecision("min_edge").notNull().default(0.04),
  minProb: doublePrecision("min_prob").notNull().default(0.3),
  minOdds: doublePrecision("min_odds").notNull().default(1.4),
  maxOdds: doublePrecision("max_odds").notNull().default(4.5),
  maxPicksPerDay: integer("max_picks_per_day").notNull().default(8),
  modelWeight: doublePrecision("model_weight").notNull().default(0.5),
  leagues: text("leagues").notNull().default("E0,SP1,I1,D1,F1,N1,P1"),
  daysAhead: integer("days_ahead").notNull().default(2),
  language: text("language").notNull().default("ar"),
  useWebSearch: boolean("use_web_search").notNull().default(true),
  llmProvider: text("llm_provider").notNull().default("anthropic"), // anthropic | openai | gemini
  llmModel: text("llm_model"), // null = the provider's default model
  displayName: text("display_name").notNull().default("Anouar"), // used by the ticket advice
  telegramAlerts: boolean("telegram_alerts").notNull().default(false),
  telegramChatId: text("telegram_chat_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const matches = pgTable(
  "matches",
  {
    id: text("id").primaryKey(),
    league: text("league").notNull(),
    kickoff: timestamp("kickoff", { withTimezone: true }).notNull(),
    home: text("home").notNull(),
    away: text("away").notNull(),
    status: text("status").notNull().default("SCHEDULED"), // SCHEDULED | FINISHED
    homeGoals: integer("home_goals"),
    awayGoals: integer("away_goals"),
    homeCorners: integer("home_corners"),
    awayCorners: integer("away_corners"),
    odds: jsonb("odds").$type<Record<string, number>>(),
    closingOdds: jsonb("closing_odds").$type<Record<string, number>>(),
    prediction: jsonb("prediction"),
    analysis: jsonb("analysis"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("matches_kickoff_idx").on(t.kickoff), index("matches_status_kickoff_idx").on(t.status, t.kickoff)]
);

export const picks = pgTable(
  "picks",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    market: text("market").notNull(),
    selection: text("selection").notNull(),
    key: text("key").notNull(), // "1X2:HOME"
    label: text("label").notNull(),
    modelProb: doublePrecision("model_prob").notNull(),
    marketProb: doublePrecision("market_prob").notNull(),
    prob: doublePrecision("prob").notNull(),
    odds: doublePrecision("odds").notNull(),
    edge: doublePrecision("edge").notNull(),
    kelly: doublePrecision("kelly").notNull(),
    stakePct: doublePrecision("stake_pct").notNull(),
    stake: doublePrecision("stake").notNull(),
    verdict: text("verdict"), // KEEP | CAUTION | AVOID
    status: text("status").notNull().default("SUGGESTED"), // SUGGESTED | PLACED | SKIPPED
    source: text("source").notNull().default("MODEL"), // MODEL | SCREENSHOT (odds read from a bookmaker screenshot; runDaily leaves these alone)
    result: text("result").notNull().default("PENDING"), // PENDING | WON | LOST | VOID
    profit: doublePrecision("profit"),
    closingOdds: doublePrecision("closing_odds"),
    clv: doublePrecision("clv"),
    runDate: timestamp("run_date", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("picks_match_key_uq").on(t.matchId, t.key),
    index("picks_match_edge_idx").on(t.matchId, t.edge),
    index("picks_run_date_idx").on(t.runDate),
    index("picks_result_status_idx").on(t.result, t.status),
  ]
);

export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    kind: text("kind").notNull(), // DAILY | SETTLE
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    matchesAnalysed: integer("matches_analysed").notNull().default(0),
    picksCount: integer("picks_count").notNull().default(0),
    settledCount: integer("settled_count").notNull().default(0),
    summary: text("summary"),
    log: text("log"),
    error: text("error"),
    // When the row was written. started_at is the run's reference time, which seed-demo sets in the past.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("runs_kind_started_idx").on(t.kind, t.startedAt), index("runs_started_idx").on(t.startedAt)]
);

/** Logo cache, one row per football-data team name and league. logoUrl null = searched, nothing found. */
export const teamLogos = pgTable(
  "team_logos",
  {
    name: text("name").notNull(),
    league: text("league").notNull(),
    logoUrl: text("logo_url"),
    source: text("source").notNull(), // thesportsdb | api-football
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.name, t.league] })]
);

export const leagueLogos = pgTable("league_logos", {
  code: text("code").primaryKey(),
  logoUrl: text("logo_url").notNull(),
});

/** Accumulators built in the ticket panel. Settled with the picks. */
export const tickets = pgTable(
  "tickets",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    stake: doublePrecision("stake").notNull(),
    totalOdds: doublePrecision("total_odds").notNull(),
    prob: doublePrecision("prob").notNull(),
    ev: doublePrecision("ev").notNull(),
    status: text("status").notNull().default("PENDING"), // PENDING | WON | LOST | VOID
    profit: doublePrecision("profit"),
  },
  (t) => [index("tickets_created_idx").on(t.createdAt), index("tickets_status_idx").on(t.status)]
);

export const ticketLegs = pgTable(
  "ticket_legs",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    ticketId: text("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
    matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    odds: doublePrecision("odds").notNull(),
    prob: doublePrecision("prob").notNull(),
    result: text("result").notNull().default("PENDING"), // PENDING | WON | LOST | VOID
  },
  (t) => [index("ticket_legs_ticket_idx").on(t.ticketId), index("ticket_legs_match_idx").on(t.matchId)]
);

/*
 * Login (Better Auth, src/lib/auth/server.ts). The property names are the field
 * names Better Auth expects; the SQL names follow this file. Ids are generated
 * by Better Auth. bootstrap.ts creates the same tables on an existing database.
 */

export const authUsers = pgTable("auth_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)]
);

/** One row per sign-in method; email + password is providerId "credential" with the scrypt hash in `password`. */
export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_accounts_user_idx").on(t.userId)]
);

export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_verifications_identifier_idx").on(t.identifier)]
);

/** Sign-in attempts per IP and path, so the limit holds across serverless instances. */
export const authRateLimits = pgTable("auth_rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/** Which version of bootstrap.ts UPGRADES this database has run (one row, id = 1). */
export const schemaVersion = pgTable("schema_version", {
  id: integer("id").primaryKey(),
  version: text("version").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Settings = typeof settings.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Pick = typeof picks.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type PickWithMatch = Pick & { match: Match };
export type Ticket = typeof tickets.$inferSelect;
export type TicketLegRow = typeof ticketLegs.$inferSelect;

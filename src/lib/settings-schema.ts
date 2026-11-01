import { z } from "zod";
import { PROVIDER_IDS } from "./llm/types";

export const settingsSchema = z.object({
  // Every stake is a share of it, so it must be above 0.
  bankroll: z.coerce.number().positive(),
  currency: z.string().min(1).max(6),
  kellyFraction: z.coerce.number().min(0).max(1),
  maxStakePct: z.coerce.number().min(0).max(0.2),
  minEdge: z.coerce.number().min(0).max(1),
  minProb: z.coerce.number().min(0).max(1),
  minOdds: z.coerce.number().min(1.01),
  maxOdds: z.coerce.number().min(1.01),
  maxPicksPerDay: z.coerce.number().int().min(0).max(50),
  modelWeight: z.coerce.number().min(0).max(1),
  leagues: z.string().regex(/^[A-Z0-9]+(,[A-Z0-9]+)*$/, "Comma separated codes, e.g. E0,SP1"),
  daysAhead: z.coerce.number().int().min(1).max(7),
  language: z.enum(["ar", "darija", "fr", "en"]),
  useWebSearch: z.boolean(),
  llmProvider: z.enum(PROVIDER_IDS),
  // Empty = the provider's default model.
  llmModel: z
    .string()
    .trim()
    .max(100)
    .regex(/^[\w.:/-]*$/, "Model ids use letters, digits and . _ - : /")
    .nullable()
    .transform((v) => v || null),
  // Name the ticket advice addresses.
  displayName: z.string().trim().min(1).max(40),
  telegramAlerts: z.boolean().default(false),
  telegramChatId: z
    .string()
    .trim()
    .max(50)
    .nullable()
    .transform((v) => v || null)
    .default(null),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

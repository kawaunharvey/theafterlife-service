import { z } from "zod";

// Centralized environment schema using zod for validation and typing
export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URI: z.string().min(1, "DATABASE_URI is required"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  GOOGLE_PLACES_API_KEY: z.string().min(1, "GOOGLE_PLACES_API_KEY is required"),
  PLACES_SEARCH_RADIUS_METERS: z.coerce.number().positive().default(5000),
  PLACES_SEARCH_PAGE_SIZE: z.coerce.number().int().min(1).max(20).default(20),
  PLACES_SNAPSHOT_TTL_MINUTES: z.coerce.number().int().positive().default(1440),
  PLACES_SNAPSHOT_REFRESH_LEEWAY_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .default(120),
  PLACES_REFRESH_BATCH_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100),
  PLACES_ONDEMAND_REFRESH_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  PLACES_MAINTENANCE_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  AI_SCORING_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  AI_MATCHING_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  SERVICE_PUBLIC_BASE_URL: z.string().url().optional(),

  // Blueprints
  BLUEPRINTS_ENABLE_INAPP_RESOURCES: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Crownworks → Underworld webhook auth
  CROWNWORKS_WEBHOOK_SECRET: z.string().optional(),

  // Redis (used by PEC ContextStore cache + BullMQ)
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // PEC (Prediction Error Correction)
  PEC_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  PEC_PROVISIONAL_BLOCKS_EXECUTION: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  PEC_VALIDATION_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),
  PEC_CONTEXT_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  // Live obituary generation
  OBITUARY_MIN_MEMORIES: z.coerce.number().int().min(1).default(3),

  // RevenueCat
  REVENUECAT_IOS_API_KEY: z.string().min(1, "REVENUECAT_IOS_API_KEY is required"),
  REVENUECAT_WEBHOOK_SECRET: z.string().min(1, "REVENUECAT_WEBHOOK_SECRET is required"),

  // Subscription discovery ranges (configurable without code change)
  DISCOVERY_RANGE_FREE_METERS: z.coerce.number().int().positive().default(375),
  DISCOVERY_RANGE_LIFETIME_METERS: z.coerce.number().int().positive().default(750),
  LIFETIME_MEMBERSHIP_CAP: z.coerce.number().int().positive().default(200),

  // Memory drift
  ANCHOR_HOME_TERRITORY_RADIUS_METERS: z.coerce.number().int().positive().default(2000),
  NORMAL_DRIFT_SPEED_METERS_PER_HOUR: z.coerce.number().positive().default(10),
  ANCHOR_PULL_SPEED_METERS_PER_HOUR: z.coerce.number().positive().default(100),

  // Marker feeds
  RECENTLY_DISCOVERED_DAYS: z.coerce.number().int().positive().default(14),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    const messages = [
      ...Object.entries(flattened.fieldErrors).flatMap(([key, errors]) =>
        (errors || []).map((msg) => `${key}: ${msg}`),
      ),
      ...flattened.formErrors,
    ];
    throw new Error(
      `Invalid environment configuration:\n${messages.join("\n")}`,
    );
  }
  return parsed.data;
}

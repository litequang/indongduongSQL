import "dotenv/config";
import { z } from "zod";
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_ORIGIN: z.string().url(),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.string().default("4100"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).default(0),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: z.string().regex(/^[a-zA-Z0-9_]+$/),
  DB_EXPECTED_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_POOL_LIMIT: z.coerce.number().int().min(1).max(8).default(4),
  DB_POOL_QUEUE_LIMIT: z.coerce.number().int().min(1).max(50).default(20),
  SETUP_SECRET: z.string().default(""),
  SESSION_HOURS: z.coerce.number().int().min(1).max(48).default(12),
});
export type Config = ReturnType<typeof loadConfig>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const v = envSchema.parse(env);
  if (v.DB_NAME !== v.DB_EXPECTED_NAME)
    throw new Error(
      "DB_NAME must match the explicit DB_EXPECTED_NAME allowlist.",
    );
  if (v.DB_USER.toLowerCase() === "root")
    throw new Error("Use a dedicated database account, never root.");
  const origin = new URL(v.APP_ORIGIN);
  if (origin.origin !== v.APP_ORIGIN || origin.username || origin.password)
    throw new Error(
      "APP_ORIGIN must be an exact origin without path or credentials.",
    );
  if (v.NODE_ENV === "production" && origin.protocol !== "https:")
    throw new Error("Production requires HTTPS APP_ORIGIN.");
  if (v.SETUP_SECRET && v.SETUP_SECRET.length < 32)
    throw new Error("SETUP_SECRET requires at least 32 random characters.");
  if (
    !/^\d+$/.test(v.PORT) &&
    !v.PORT.startsWith("/") &&
    !v.PORT.startsWith("\\")
  )
    throw new Error("Invalid PORT / Passenger socket.");
  return {
    ...v,
    secureCookies: v.NODE_ENV === "production",
    cookieName:
      v.NODE_ENV === "production" ? "__Host-idd_session" : "idd_session",
  };
}

import { z } from "zod";
// Credentials stay in the process environment. Never expose configuration values.
export function readR2Config(env: NodeJS.ProcessEnv = process.env) {
  if (
    !env.R2_ENDPOINT &&
    !env.R2_BUCKET &&
    !env.R2_ACCESS_KEY_ID &&
    !env.R2_SECRET_ACCESS_KEY
  )
    return null;
  return z
    .object({
      R2_ENDPOINT: z
        .string()
        .regex(/^https:\/\/[a-f0-9]+\.r2\.cloudflarestorage\.com$/),
      R2_BUCKET: z.string().min(3).max(63),
      R2_ACCESS_KEY_ID: z.string().min(16),
      R2_SECRET_ACCESS_KEY: z.string().min(32),
      R2_BACKUP_BUCKET: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.string().min(3).max(63).optional(),
      ),
      R2_ENVIRONMENT: z.enum(["development", "test", "production"]),
    })
    .refine(
      (v) => !v.R2_BACKUP_BUCKET || v.R2_BUCKET !== v.R2_BACKUP_BUCKET,
      "Backup bucket must differ",
    )
    .refine(
      (v) => v.R2_ENVIRONMENT === (env.NODE_ENV || "development"),
      "R2 environment must match runtime",
    )
    .parse(env);
}
export const IMAGE_POLICY = {
  mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 5 * 1024 * 1024,
  uploadTtlSeconds: 300,
  downloadTtlSeconds: 300,
} as const;

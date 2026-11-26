import { z } from "zod";
// Architecture/configuration only. No upload endpoint exists in Phase 01.
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
    })
    .parse(env);
}
export const IMAGE_POLICY = {
  mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 5 * 1024 * 1024,
  uploadTtlSeconds: 300,
  downloadTtlSeconds: 300,
} as const;

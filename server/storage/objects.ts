import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { ApiError } from "../errors";
import { readR2Config, IMAGE_POLICY } from "./config";
export interface ObjectStore {
  get(key: string, backup?: boolean): Promise<Buffer | null>;
  put(key: string, data: Buffer, mime: string, backup?: boolean): Promise<void>;
  delete(key: string, backup?: boolean): Promise<void>;
  backupEnabled: boolean;
}
export const digest = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");
export function r2Store(): ObjectStore | null {
  const c = readR2Config();
  if (!c) return null;
  const client = new S3Client({
    endpoint: c.R2_ENDPOINT,
    region: "auto",
    credentials: {
      accessKeyId: c.R2_ACCESS_KEY_ID,
      secretAccessKey: c.R2_SECRET_ACCESS_KEY,
    },
    maxAttempts: 2,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return s3ObjectStore(client, c.R2_BUCKET, c.R2_BACKUP_BUCKET);
}
export function s3ObjectStore(
  client: S3Client,
  primaryBucket: string,
  backupBucket?: string,
): ObjectStore {
  const bucket = (backup: boolean) => {
    if (backup && !backupBucket)
      throw new ApiError(
        503,
        "BACKUP_UNAVAILABLE",
        "Chưa cấu hình bucket sao lưu riêng.",
      );
    return backup ? backupBucket! : primaryBucket;
  };
  return {
    backupEnabled: !!backupBucket,
    async get(key, backup = false) {
      try {
        const r = await client.send(
          new GetObjectCommand({ Bucket: bucket(backup), Key: key }),
          { abortSignal: AbortSignal.timeout(10000) },
        );
        if (!r.Body || Number(r.ContentLength) > IMAGE_POLICY.maxBytes)
          throw new Error("Invalid object size");
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of r.Body as AsyncIterable<Uint8Array>) {
          size += chunk.length;
          if (size > IMAGE_POLICY.maxBytes)
            throw new Error("Object exceeds size limit");
          chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
      } catch (e) {
        if (
          (e as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode === 404
        )
          return null;
        throw e;
      }
    },
    async put(key, data, mime, backup = false) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket(backup),
            Key: key,
            Body: data,
            ContentType: mime,
            IfNoneMatch: "*",
            Metadata: { sha256: digest(data) },
          }),
          { abortSignal: AbortSignal.timeout(10000) },
        );
      } catch (e) {
        // Lost-response retry never overwrites an existing object with different bytes.
        if (
          (e as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode !== 412
        )
          throw e;
        const current = await this.get(key, backup);
        if (!current || digest(current) !== digest(data))
          throw new ApiError(
            409,
            "OBJECT_CONFLICT",
            "Tệp đã tồn tại với nội dung khác.",
          );
      }
    },
    async delete(key, backup = false) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket(backup), Key: key }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
    },
  };
}
export async function inspectImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > IMAGE_POLICY.maxBytes)
    throw new ApiError(413, "IMAGE_SIZE", "Ảnh tối đa 5 MiB.");
  try {
    const image = sharp(bytes, {
      limitInputPixels: 16_000_000,
      failOn: "warning",
      animated: false,
    });
    const meta = await image.metadata();
    if (
      !["jpeg", "png", "webp"].includes(meta.format ?? "") ||
      (meta.pages ?? 1) !== 1
    )
      throw new Error("Unsupported image");
    // Full decode + normalization removes metadata, trailing payloads and malformed images.
    const normalized = await image
      .rotate()
      .toFormat(meta.format as "jpeg" | "png" | "webp")
      .toBuffer({ resolveWithObject: true });
    if (normalized.data.length > IMAGE_POLICY.maxBytes)
      throw new Error("Normalized image too large");
    return {
      bytes: normalized.data,
      mime: "image/" + meta.format,
      width: normalized.info.width,
      height: normalized.info.height,
    };
  } catch {
    throw new ApiError(
      422,
      "INVALID_IMAGE",
      "Cần ảnh JPEG, PNG hoặc WebP hợp lệ, tối đa 16 triệu điểm ảnh và một khung hình.",
    );
  }
}

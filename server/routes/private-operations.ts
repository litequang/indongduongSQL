import express, { type Express } from "express";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import type { Config } from "../config";
import { routeContext } from "../auth/context";
import { requireCsrf, requireOrigin } from "../auth/session";
import { allowed, wrap } from "../middleware/http";
import { idSchema } from "../../shared/business";
import { ApiError } from "../errors";
import { rows } from "../database/pool";
import { audit, changed } from "../services/audit";
import { digest, inspectImage, type ObjectStore } from "../storage/objects";
import { registryImage, targetAuthority } from "../storage/registry";

export function registerImageUpload(
  app: Express,
  pool: Pool,
  config: Config,
  store: ObjectStore | null,
) {
  let inFlight = 0;
  const { readSession, mutation, limited } = routeContext(pool, config);
  // Mounted before JSON parsing. Both authentication and CSRF precede binary allocation.
  app.put(
    "/api/images/:id/content",
    (req, res, next) => {
      void (async () => {
        requireOrigin(req, config);
        requireCsrf(req, await readSession(req));
        if (!store)
          throw new ApiError(
            503,
            "STORAGE_UNAVAILABLE",
            "Chưa cấu hình kho ảnh riêng.",
          );
        await limited(req, "image-upload", 30);
        if (inFlight >= 2)
          throw new ApiError(
            503,
            "UPLOAD_BUSY",
            "Máy chủ đang xử lý ảnh. Thử lại sau.",
          );
        inFlight++;
        let released = false;
        const release = () => {
          if (!released) {
            released = true;
            inFlight--;
          }
        };
        res.locals.releaseImage = release;
        const releaseIfIdle = () => {
          if (!res.locals.imageProcessing) release();
        };
        res.once("finish", releaseIfIdle);
        res.once("close", releaseIfIdle);
        next();
      })().catch(next);
    },
    express.raw({
      type: ["image/jpeg", "image/png", "image/webp"],
      limit: "5mb",
      inflate: false,
    }),
    wrap(async (req, res) => {
      res.locals.imageProcessing = true;
      try {
        const id = idSchema.parse(req.params.id);
        if (!Buffer.isBuffer(req.body))
          throw new ApiError(
            415,
            "IMAGE_REQUIRED",
            "Chọn ảnh JPEG, PNG hoặc WebP.",
          );
        const s = await readSession(req);
        const ticket = await registryImage(pool, id, s.user, true);
        if (
          ticket.status === "STAGED" &&
          new Date(ticket.expires_at).getTime() < Date.now()
        )
          throw new ApiError(
            410,
            "UPLOAD_EXPIRED",
            "Phiên tải ảnh đã hết hạn. Chọn lại ảnh.",
          );
        const image = await inspectImage(req.body);
        const hash = digest(image.bytes);
        if (ticket.status === "ACTIVE" && ticket.sha256 !== hash)
          throw new ApiError(
            409,
            "IMAGE_IMMUTABLE",
            "Ảnh đã xác minh không thể ghi đè.",
          );
        await store!.put(ticket.object_key, image.bytes, image.mime);
        await mutation(req, async (db, current) => {
          const latest = await registryImage(db, id, current.user, true);
          if (latest.status === "ACTIVE") {
            if (latest.sha256 !== hash)
              throw new ApiError(
                409,
                "IMAGE_IMMUTABLE",
                "Ảnh đã có nội dung khác.",
              );
            return;
          }
          if (new Date(latest.expires_at).getTime() < Date.now())
            throw new ApiError(
              410,
              "UPLOAD_EXPIRED",
              "Phiên tải ảnh đã hết hạn.",
            );
          await db.execute(
            "UPDATE image_registry SET status='ACTIVE',sha256=?,byte_size=?,mime_type=?,width=?,height=? WHERE id=?",
            [
              hash,
              image.bytes.length,
              image.mime,
              image.width,
              image.height,
              id,
            ],
          );
          await audit(db, current.user.id, "IMAGE_VERIFIED", id);
        });
        res.json({ registryId: id });
      } finally {
        res.locals.releaseImage();
      }
    }),
  );
}
export function registerPrivateOperations(
  app: Express,
  pool: Pool,
  config: Config,
  store: ObjectStore | null,
) {
  const { readSession, mutation, limited } = routeContext(pool, config);
  const storage = () => {
    if (!store)
      throw new ApiError(
        503,
        "STORAGE_UNAVAILABLE",
        "Chưa cấu hình kho ảnh riêng.",
      );
    return store;
  };
  app.get(
    "/api/storage/status",
    wrap(async (req, res) => {
      await readSession(req);
      res.json({ enabled: !!store, backupEnabled: !!store?.backupEnabled });
    }),
  );
  app.post(
    "/api/images",
    wrap(async (req, res) => {
      const input = z
        .object({
          id: idSchema,
          targetType: z.enum(["DESIGN", "PRODUCTION", "AVATAR"]),
          targetId: idSchema,
        })
        .strict()
        .parse(req.body);
      const result = await mutation(req, async (db, s) => {
        storage();
        allowed(
          await targetAuthority(
            db,
            input.targetType,
            input.targetId,
            s.user,
            true,
          ),
        );
        const [existing] = await rows(
          db,
          "SELECT * FROM image_registry WHERE id=?",
          [input.id],
        );
        if (existing) {
          allowed(
            existing.owner_id === s.user.id &&
              existing.target_type === input.targetType &&
              existing.target_id === input.targetId &&
              existing.status !== "DELETED",
          );
          return { id: input.id, status: existing.status };
        }
        const [count] = await rows(
          db,
          `SELECT COUNT(*) AS n FROM image_registry r WHERE owner_id=? AND status<>'DELETED' AND NOT EXISTS(SELECT 1 FROM design_versions v WHERE v.image_registry_id=r.id) AND NOT EXISTS(SELECT 1 FROM production_print_images i WHERE i.image_registry_id=r.id) AND NOT EXISTS(SELECT 1 FROM users u WHERE u.avatar_registry_id=r.id)`,
          [s.user.id],
        );
        if (Number(count.n) >= 100)
          throw new ApiError(
            409,
            "IMAGE_QUOTA",
            "Đã có 100 ảnh chưa gắn vào bản ghi. Lưu ảnh vào bản ghi hoặc nhờ kỹ thuật dọn ảnh cũ.",
          );
        await db.execute(
          `INSERT INTO image_registry(id,owner_id,target_type,target_id,object_key,expires_at) VALUES(?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE))`,
          [
            input.id,
            s.user.id,
            input.targetType,
            input.targetId,
            "images/" + input.id,
          ],
        );
        await audit(db, s.user.id, "IMAGE_STAGED", input.id);
        return { id: input.id, status: "STAGED" };
      });
      res.status(201).json(result);
    }),
  );
  app.get(
    "/api/images/:id/content",
    wrap(async (req, res) => {
      const s = await readSession(req);
      const image = await registryImage(
        pool,
        idSchema.parse(req.params.id),
        s.user,
      );
      if (image.status !== "ACTIVE")
        throw new ApiError(404, "NOT_FOUND", "Ảnh chưa sẵn sàng.");
      const bytes = await storage().get(image.object_key);
      if (!bytes || digest(bytes) !== image.sha256)
        throw new ApiError(
          503,
          "IMAGE_INTEGRITY",
          "Ảnh thiếu hoặc sai checksum. Liên hệ kỹ thuật để khôi phục.",
        );
      // Revalidate after external I/O, including session revocation and reassignment.
      await registryImage(pool, image.id, (await readSession(req)).user);
      res
        .type(image.mime_type)
        .set("Content-Disposition", 'inline; filename="image"')
        .send(bytes);
    }),
  );
  app.delete(
    "/api/images/:id",
    wrap(async (req, res) => {
      const key = await mutation(req, async (db, s) => {
        storage();
        const image = await registryImage(
          db,
          idSchema.parse(req.params.id),
          s.user,
          true,
        );
        const [linked] = await rows(
          db,
          "SELECT id FROM design_versions WHERE image_registry_id=? UNION ALL SELECT id FROM production_print_images WHERE image_registry_id=? UNION ALL SELECT id FROM users WHERE avatar_registry_id=? LIMIT 1",
          [image.id, image.id, image.id],
        );
        if (linked)
          throw new ApiError(
            409,
            "IMAGE_REFERENCED",
            "Ảnh còn được tham chiếu trong lịch sử.",
          );
        await db.execute(
          "UPDATE image_registry SET status='DELETED' WHERE id=?",
          [image.id],
        );
        await audit(db, s.user.id, "IMAGE_DELETED", image.id);
        return image.object_key as string;
      });
      await storage().delete(key);
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/storage/jobs",
    wrap(async (req, res) => {
      allowed((await readSession(req)).user.role === "DEVELOPER");
      res.json({
        items: await rows(
          pool,
          `SELECT j.id,j.mode,j.created_at,MAX(i.image_id) AS lastImageId,COUNT(i.image_id) AS total,SUM(i.status='OK') AS ok,SUM(i.status='FAILED') AS failed FROM image_backup_jobs j LEFT JOIN image_backup_items i ON i.job_id=j.id GROUP BY j.id ORDER BY j.created_at DESC,j.id DESC LIMIT 30`,
        ),
      });
    }),
  );
  app.post(
    "/api/storage/jobs",
    wrap(async (req, res) => {
      const input = z
        .object({
          id: idSchema,
          mode: z.enum(["BACKUP", "VERIFY", "RESTORE"]),
          afterId: idSchema.optional(),
        })
        .strict()
        .parse(req.body);
      const result = await mutation(req, async (db, s) => {
        allowed(s.user.role === "DEVELOPER");
        if (!storage().backupEnabled)
          throw new ApiError(
            503,
            "BACKUP_UNAVAILABLE",
            "Chưa cấu hình bucket sao lưu riêng.",
          );
        const [existing] = await rows(
          db,
          "SELECT mode FROM image_backup_jobs WHERE id=?",
          [input.id],
        );
        if (existing) {
          allowed(existing.mode === input.mode);
          return input;
        }
        await db.execute(
          "INSERT INTO image_backup_jobs(id,actor_id,mode) VALUES(?,?,?)",
          [input.id, s.user.id, input.mode],
        );
        await db.execute(
          `INSERT INTO image_backup_items(job_id,image_id) SELECT ?,id FROM image_registry WHERE status='ACTIVE' AND (? IS NULL OR id>?) ORDER BY id LIMIT 500`,
          [input.id, input.afterId ?? null, input.afterId ?? null],
        );
        await audit(
          db,
          s.user.id,
          "IMAGE_" + input.mode + "_CREATED",
          input.id,
        );
        return input;
      });
      res.status(201).json(result);
    }),
  );
  app.get(
    "/api/storage/jobs/:id",
    wrap(async (req, res) => {
      allowed((await readSession(req)).user.role === "DEVELOPER");
      const id = idSchema.parse(req.params.id);
      const q = z
        .object({ afterId: idSchema.optional() })
        .strict()
        .parse(req.query);
      const [job] = await rows(
        pool,
        "SELECT id,mode,created_at FROM image_backup_jobs WHERE id=?",
        [id],
      );
      if (!job) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy tác vụ.");
      const items = await rows(
        pool,
        "SELECT image_id AS imageId,status,message,attempts FROM image_backup_items WHERE job_id=? AND (? IS NULL OR image_id>?) ORDER BY image_id LIMIT 101",
        [id, q.afterId ?? null, q.afterId ?? null],
      );
      res.json({
        job,
        items: items.slice(0, 100),
        hasMore: items.length > 100,
      });
    }),
  );
  app.get(
    "/api/storage/coverage",
    wrap(async (req, res) => {
      allowed((await readSession(req)).user.role === "DEVELOPER");
      const [counts] = await rows(
        pool,
        `SELECT COUNT(*) total,SUM(EXISTS(SELECT 1 FROM image_backup_items i JOIN image_backup_jobs j ON j.id=i.job_id WHERE i.image_id=r.id AND i.status='OK' AND j.mode='BACKUP')) backedUp FROM image_registry r WHERE r.status='ACTIVE'`,
      );
      res.json({
        total: Number(counts.total),
        backedUp: Number(counts.backedUp ?? 0),
      });
    }),
  );
  app.post(
    "/api/storage/cleanup",
    wrap(async (req, res) => {
      z.object({}).strict().parse(req.body);
      const images = await mutation(req, async (db, s) => {
        allowed(s.user.role === "DEVELOPER");
        storage();
        const expired = await rows(
          db,
          `SELECT r.id,r.object_key FROM image_registry r WHERE (r.status='DELETED' AND r.object_key NOT LIKE 'retired/%') OR (r.status<>'DELETED' AND r.created_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 DAY) AND NOT EXISTS(SELECT 1 FROM design_versions v WHERE v.image_registry_id=r.id) AND NOT EXISTS(SELECT 1 FROM production_print_images p WHERE p.image_registry_id=r.id) AND NOT EXISTS(SELECT 1 FROM users u WHERE u.avatar_registry_id=r.id)) ORDER BY r.created_at LIMIT 10`,
        );
        for (const image of expired)
          await db.execute(
            "UPDATE image_registry SET status='DELETED' WHERE id=?",
            [image.id],
          );
        await audit(db, s.user.id, "IMAGE_CLEANUP", s.user.id, {
          count: expired.length,
        });
        return expired;
      });
      for (const image of images) {
        await storage().delete(image.object_key);
        await mutation(req, async (db, s) => {
          allowed(s.user.role === "DEVELOPER");
          await db.execute(
            "UPDATE image_registry SET object_key=CONCAT('retired/',id) WHERE id=? AND status='DELETED'",
            [image.id],
          );
        });
      }
      res.json({ cleaned: images.length });
    }),
  );
  app.post(
    "/api/storage/jobs/:id/run",
    wrap(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      z.object({ retryFailed: z.boolean().default(false) })
        .strict()
        .parse(req.body);
      const s = await readSession(req);
      requireCsrf(req, s);
      allowed(s.user.role === "DEVELOPER");
      await limited(req, "backup-run", 30);
      // One object per request: bounded memory/I/O, resumable after server restarts, no worker required.
      const [job] = await rows(
        pool,
        "SELECT * FROM image_backup_jobs WHERE id=?",
        [id],
      );
      if (!job) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy tác vụ.");
      const candidates = await rows(
        pool,
        `SELECT r.*,i.status AS item_status FROM image_backup_items i JOIN image_registry r ON r.id=i.image_id WHERE i.job_id=? AND (i.status='PENDING' OR (?=1 AND i.status='FAILED')) ORDER BY i.image_id LIMIT 1`,
        [id, !!req.body.retryFailed],
      );
      const image = candidates[0];
      if (!image) {
        res.json({ done: true });
        return;
      }
      const object = storage();
      let message = "Đã xác minh checksum.";
      let ok = false;
      const check = (data: Buffer | null) => {
        if (!data || digest(data) !== image.sha256)
          throw new Error("CHECKSUM_OR_MISSING");
        return data;
      };
      try {
        if (image.status !== "ACTIVE") throw new Error("IMAGE_RETIRED");
        const backupKey = "verified/" + image.id + "/" + image.sha256;
        if (job.mode === "BACKUP") {
          const bytes = check(await object.get(image.object_key));
          await object.put(backupKey, bytes, image.mime_type, true);
          check(await object.get(backupKey, true));
        } else if (job.mode === "VERIFY") {
          check(await object.get(backupKey, true));
          check(await object.get(image.object_key));
        } else {
          const current = await object.get(image.object_key);
          if (current) {
            check(current);
            message = "Ảnh đang có hợp lệ; giữ nguyên.";
          } else {
            const bytes = check(await object.get(backupKey, true));
            await object.put(image.object_key, bytes, image.mime_type);
            check(await object.get(image.object_key));
            message = "Đã khôi phục ảnh thiếu.";
          }
        }
        ok = true;
      } catch {
        message =
          "Thiếu ảnh, sai checksum hoặc kho lưu trữ chưa phản hồi. Không ghi đè ảnh hiện có.";
      }
      await mutation(req, async (db, current) => {
        allowed(current.user.role === "DEVELOPER");
        await db.execute(
          "UPDATE image_backup_items SET status=?,message=?,attempts=attempts+1 WHERE job_id=? AND image_id=?",
          [ok ? "OK" : "FAILED", message, id, image.id],
        );
        await audit(
          db,
          current.user.id,
          "IMAGE_" + job.mode + (ok ? "_OK" : "_FAILED"),
          image.id,
          { jobId: id },
        );
      });
      res.json({ done: false, imageId: image.id, ok, message });
    }),
  );
  app.get(
    "/api/notifications",
    wrap(async (req, res) => {
      const s = await readSession(req);
      const q = z
        .object({
          before: z
            .string()
            .regex(/^\d{1,20}$/)
            .optional(),
        })
        .strict()
        .parse(req.query);
      const items = await rows(
        pool,
        `SELECT n.* FROM notifications n WHERE n.user_id=? AND (? IS NULL OR n.event_sequence<?) AND (n.entity<>'production_orders' OR EXISTS(SELECT 1 FROM production_orders p WHERE p.id=n.entity_id AND (p.status<>'DRAFT' OR p.created_by=?) AND (?<>'PRINTER' OR (p.status<>'DRAFT' AND p.printer_id=?)))) ORDER BY n.event_sequence DESC LIMIT 31`,
        [
          s.user.id,
          q.before ?? null,
          q.before ?? null,
          s.user.id,
          s.user.role,
          s.user.id,
        ],
      );
      res.json({
        items: items.slice(0, 30).map((r) => ({
          id: r.id,
          entity: r.entity,
          entityId: r.entity_id,
          sequence: String(r.event_sequence),
          read: !!r.read_at,
          createdAt: new Date(r.created_at).toISOString(),
        })),
        hasMore: items.length > 30,
      });
    }),
  );
  app.post(
    "/api/notifications/:id/read",
    wrap(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      z.object({}).strict().parse(req.body);
      await mutation(req, async (db, s) => {
        await db.execute(
          "UPDATE notifications SET read_at=COALESCE(read_at,UTC_TIMESTAMP(3)) WHERE id=? AND user_id=?",
          [id, s.user.id],
        );
        await changed(db, "notifications", s.user.id, 1);
      });
      res.json({ ok: true });
    }),
  );
}

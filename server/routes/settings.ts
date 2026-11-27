import type { Express } from "express";
import type { Pool } from "mysql2/promise";
import type { Config } from "../config";
import { routeContext } from "../auth/context";
import { wrap, allowed, fresh } from "../middleware/http";
import { z } from "zod";
import { rows, transaction } from "../database/pool";
import { settingsSchema } from "../validation";
import { canManageUsers, canManageSettings } from "../../shared/contracts";
import { readSettings, writeSettings } from "../repositories/settings";
import { audit, changed } from "../services/audit";
export function registerSettingsRoutes(
  app: Express,
  pool: Pool,
  config: Config,
) {
  const { readSession, mutation } = routeContext(pool, config);
  app.get(
    "/api/settings",
    wrap(async (req, res) => {
      await readSession(req);
      res.json({ settings: await transaction(pool, (db) => readSettings(db)) });
    }),
  );
  app.patch(
    "/api/settings",
    wrap(async (req, res) => {
      const input = settingsSchema.parse(req.body);
      const settings = await mutation(req, async (db, s) => {
        allowed(canManageSettings(s.user.role));
        const current = await readSettings(db);
        fresh(current.version, input.version);
        const next = { ...input, version: current.version + 1 };
        await writeSettings(db, next);
        await audit(db, s.user.id, "SETTINGS_UPDATED", "1");
        await changed(db, "settings", "1", next.version);
        return next;
      });
      res.json({ settings });
    }),
  );
  app.get(
    "/api/changes",
    wrap(async (req, res) => {
      const session = await readSession(req);
      const q = z
        .object({
          cursor: z
            .string()
            .regex(/^\d{1,20}$/)
            .default("0"),
        })
        .strict()
        .parse(req.query);
      const data = await rows(
        pool,
        "SELECT sequence,entity,entity_id,record_version,deleted FROM change_events WHERE sequence>? ORDER BY sequence LIMIT 101",
        [q.cursor],
      );
      const page = data.slice(0, 100);
      const productionIds = page
        .filter((r) => r.entity === "production_orders")
        .map((r) => r.entity_id);
      const visibleIds = new Set<string>();
      if (productionIds.length) {
        const visible = await rows(
          pool,
          `SELECT id FROM production_orders WHERE id IN (${productionIds.map(() => "?").join(",")}) AND (status<>'DRAFT' OR created_by=?) AND (?<>'PRINTER' OR (status<>'DRAFT' AND printer_id=?))`,
          [
            ...productionIds,
            session.user.id,
            session.user.role,
            session.user.id,
          ],
        );
        for (const row of visible) visibleIds.add(row.id);
      }
      res.json({
        changes: page
          .filter(
            (r) =>
              r.entity !== "production_orders" || visibleIds.has(r.entity_id),
          )
          .map((r) => ({
            sequence: String(r.sequence),
            entity: r.entity,
            entityId: r.entity_id,
            version: Number(r.record_version),
            deleted: Boolean(r.deleted),
          })),
        cursor: page.length ? String(page[page.length - 1].sequence) : q.cursor,
        hasMore: data.length > 100,
      });
    }),
  );
  app.get(
    "/api/audit",
    wrap(async (req, res) => {
      const s = await readSession(req);
      allowed(canManageUsers(s.user.role));
      const q = z
        .object({ page: z.coerce.number().int().min(1).max(100000).default(1) })
        .strict()
        .parse(req.query);
      const data = await rows(
        pool,
        `SELECT a.id,COALESCE(u.name,'Hệ thống') AS actor_name,a.action,a.entity_id,a.created_at FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 30 OFFSET ${(q.page - 1) * 30}`,
      );
      const [count] = await rows(pool, "SELECT COUNT(*) AS n FROM audit_logs");
      res.json({
        items: data.map((r) => ({
          id: String(r.id),
          actorName: r.actor_name,
          action: r.action,
          entityId: r.entity_id,
          createdAt: new Date(r.created_at).toISOString(),
        })),
        page: q.page,
        pageSize: 30,
        total: Number(count.n),
      });
    }),
  );
}

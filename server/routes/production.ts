import type { Express } from "express";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import type { Config } from "../config";
import { routeContext } from "../auth/context";
import { requireCsrf } from "../auth/session";
import { allowed, wrap } from "../middleware/http";
import { transaction } from "../database/pool";
import { ApiError } from "../errors";
import { idSchema, versionSchema } from "../../shared/business";
import {
  ACTION_SCHEMAS,
  canComposeProduction,
  canReviseProduction,
  productionFields,
  type ProductionAction,
  type ProductionActionInput,
} from "../../shared/production";
import {
  listProduction,
  productionQuery,
  productionDetail,
  saveProduction,
  designerQuery,
  listDesignerQueue,
  updateDesignerItem,
} from "../repositories/production";
import { actProduction } from "../services/production-workflow";

export function registerProductionRoutes(
  app: Express,
  pool: Pool,
  config: Config,
) {
  const { readSession, mutation } = routeContext(pool, config);
  app.get(
    "/api/designer-queue",
    wrap(async (req, res) => {
      const s = await readSession(req);
      allowed(canReviseProduction(s.user.role));
      res.json(await listDesignerQueue(pool, designerQuery.parse(req.query)));
    }),
  );
  app.patch(
    "/api/designer-queue/:id",
    wrap(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      const input = z
        .object({
          version: versionSchema,
          status: z.enum([
            "WAITING_DESIGN",
            "NEEDS_INFO",
            "DESIGNING",
            "READY_FOR_PRODUCTION",
          ]),
          instructionRaw: z.string().trim().max(5000),
          note: z.string().trim().max(1000),
          isUrgent: z.boolean(),
        })
        .strict()
        .parse(req.body);
      await mutation(req, (db, s) => {
        allowed(canReviseProduction(s.user.role));
        return updateDesignerItem(db, id, input, s.user);
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/production-orders",
    wrap(async (req, res) => {
      const s = await readSession(req);
      res.json(
        await listProduction(pool, productionQuery.parse(req.query), s.user),
      );
    }),
  );
  app.get(
    "/api/production-orders/:id",
    wrap(async (req, res) => {
      const s = await readSession(req);
      const id = idSchema.parse(req.params.id);
      res.json(
        await transaction(pool, (db) => productionDetail(db, id, s.user)),
      );
    }),
  );
  app.post(
    "/api/production-orders",
    wrap(async (req, res) => {
      const { id, ...input } = productionFields
        .extend({ id: idSchema })
        .parse(req.body);
      const detail = await mutation(req, (db, s) => {
        allowed(canComposeProduction(s.user.role));
        return saveProduction(db, id, input, s.user);
      });
      res.status(201).json(detail);
    }),
  );
  app.patch(
    "/api/production-orders/:id",
    wrap(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      const { version, ...input } = productionFields
        .extend({ version: versionSchema })
        .parse(req.body);
      const detail = await mutation(req, (db, s) => {
        allowed(canComposeProduction(s.user.role));
        return saveProduction(db, id, input, s.user, version);
      });
      res.json(detail);
    }),
  );
  // Independent bounded transactions intentionally preserve partial batch success.
  app.post(
    "/api/production-batches/dispatch",
    wrap(async (req, res) => {
      const s = await readSession(req);
      requireCsrf(req, s);
      allowed(canComposeProduction(s.user.role));
      const { items } = z
        .object({
          items: z
            .array(ACTION_SCHEMAS.dispatch.extend({ id: idSchema }))
            .min(1)
            .max(20),
        })
        .strict()
        .parse(req.body);
      const results = [];
      for (const { id, ...input } of items) {
        try {
          const detail = await mutation(req, (db, current) =>
            actProduction(
              db,
              id,
              { ...input, action: "dispatch" },
              current.user,
            ),
          );
          results.push({ id, ok: true, order: detail.order });
        } catch (e) {
          if (!(e instanceof ApiError)) throw e;
          results.push({
            id,
            ok: false,
            error: { code: e.code, message: e.message },
          });
        }
      }
      res.json({ results });
    }),
  );
  for (const action of Object.keys(ACTION_SCHEMAS) as ProductionAction[]) {
    app.post(
      "/api/production-orders/:id/" + action,
      wrap(async (req, res) => {
        const id = idSchema.parse(req.params.id);
        const input = {
          ...ACTION_SCHEMAS[action].parse(req.body),
          action,
        } as ProductionActionInput;
        res.json(
          await mutation(req, (db, s) => actProduction(db, id, input, s.user)),
        );
      }),
    );
  }
}

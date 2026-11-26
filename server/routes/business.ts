import type { Express } from "express";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import type { Config } from "../config";
import { routeContext } from "../auth/context";
import { requireCsrf } from "../auth/session";
import { allowed, wrap } from "../middleware/http";
import { transaction } from "../database/pool";
import {
  canCreateSales,
  canEditSales,
  canForceReopenSales,
  canManageCustomers,
  canManageDesigns,
  customerFields,
  designFields,
  idSchema,
  salesFields,
  versionSchema,
} from "../../shared/business";
import { businessAudit, pageFields } from "../repositories/business";
import {
  createCustomer,
  customerMatches,
  customerQuery,
  deleteCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from "../repositories/customers";
import {
  designQuery,
  getDesign,
  listDesigns,
  listDesignVersions,
  saveDesign,
} from "../repositories/designs";
import {
  listSales,
  salesDetail,
  salesQuery,
  saveSales,
  transitionSales,
} from "../repositories/sales";
import {
  cancelJob,
  createJob,
  createJobSchema,
  getJob,
  importPageSchema,
  listImportItems,
  listJobs,
  processJob,
  stageJob,
  stageSchema,
  startJob,
  startSchema,
} from "../repositories/customer-import";

const expected = z.object({ version: versionSchema }).strict();
const draftId = { id: idSchema };
const deleteBatch = z
  .object({
    items: z
      .array(z.object({ ...draftId, version: versionSchema }).strict())
      .min(1)
      .max(50)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
        "Khách hàng được chọn bị trùng.",
      ),
  })
  .strict();

export function registerBusinessRoutes(
  app: Express,
  pool: Pool,
  config: Config,
) {
  const { readSession, mutation } = routeContext(pool, config);
  const customerActions = [
    "CUSTOMER_CREATED",
    "CUSTOMER_UPDATED",
    "CUSTOMER_DELETED",
  ];
  app.get(
    "/api/customers",
    wrap(async (req, res) => {
      await readSession(req);
      res.json(await listCustomers(pool, customerQuery.parse(req.query)));
    }),
  );
  app.post(
    "/api/customers/check-duplicate",
    wrap(async (req, res) => {
      const s = await readSession(req);
      allowed(canManageCustomers(s.user.role));
      requireCsrf(req, s);
      const input = customerFields
        .extend({ excludeId: idSchema.optional() })
        .parse(req.body);
      const matches = (await customerMatches(pool, input)).filter(
        (item) => item.id !== input.excludeId,
      );
      res.json({
        items: matches.map(({ id, name, code }) => ({ id, name, code })),
      });
    }),
  );
  app.get(
    "/api/customers/:id",
    wrap(async (req, res) => {
      await readSession(req);
      const id = idSchema.parse(req.params.id);
      res.json(
        await transaction(pool, async (db) => ({
          customer: await getCustomer(db, id),
          activity: await businessAudit(db, id, customerActions),
        })),
      );
    }),
  );
  app.post(
    "/api/customers",
    wrap(async (req, res) => {
      const { id, ...input } = customerFields.extend(draftId).parse(req.body);
      const customer = await mutation(req, (db, s) => {
        allowed(canManageCustomers(s.user.role));
        return createCustomer(db, input, s.user.id, { source: "MANUAL", id });
      });
      res.status(201).json({ customer });
    }),
  );
  app.patch(
    "/api/customers/:id",
    wrap(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      const { version, ...input } = z
        .looseObject({ version: versionSchema })
        .refine(
          (value) => Object.keys(value).length > 1,
          "Cần ít nhất một thay đổi.",
        )
        .parse(req.body);
      const customer = await mutation(req, (db, s) => {
        allowed(canManageCustomers(s.user.role));
        return updateCustomer(db, id, version, input, s.user.id);
      });
      res.json({ customer });
    }),
  );
  app.post(
    "/api/customers/:id/delete",
    wrap(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      const { version } = expected.parse(req.body);
      await mutation(req, (db, s) => {
        allowed(canManageCustomers(s.user.role));
        return deleteCustomer(db, id, version, s.user.id);
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/customers/bulk-delete",
    wrap(async (req, res) => {
      const { items } = deleteBatch.parse(req.body);
      await mutation(req, async (db, s) => {
        allowed(canManageCustomers(s.user.role));
        for (const item of items)
          await deleteCustomer(db, item.id, item.version, s.user.id);
      });
      res.json({ ok: true });
    }),
  );

  app.get(
    "/api/customer-imports",
    wrap(async (req, res) => {
      const s = await readSession(req);
      allowed(canManageCustomers(s.user.role));
      res.json(
        await listJobs(pool, s.user.id, importPageSchema.parse(req.query)),
      );
    }),
  );
  app.get(
    "/api/customer-imports/:id",
    wrap(async (req, res) => {
      const s = await readSession(req);
      allowed(canManageCustomers(s.user.role));
      res.json({
        job: await getJob(pool, idSchema.parse(req.params.id), s.user.id),
      });
    }),
  );
  app.get(
    "/api/customer-imports/:id/items",
    wrap(async (req, res) => {
      const s = await readSession(req);
      allowed(canManageCustomers(s.user.role));
      const id = idSchema.parse(req.params.id);
      await getJob(pool, id, s.user.id);
      res.json(
        await listImportItems(
          pool,
          id,
          s.user.id,
          importPageSchema.parse(req.query),
        ),
      );
    }),
  );
  app.post(
    "/api/customer-imports",
    wrap(async (req, res) => {
      const input = createJobSchema.parse(req.body);
      const job = await mutation(req, (db, s) => {
        allowed(canManageCustomers(s.user.role));
        return createJob(db, input, s.user.id);
      });
      res.status(201).json({ job });
    }),
  );
  for (const action of ["rows", "confirm", "process", "cancel"] as const) {
    app.post(
      "/api/customer-imports/:id/" + action,
      wrap(async (req, res) => {
        const id = idSchema.parse(req.params.id);
        const job = await mutation(req, (db, s) => {
          allowed(canManageCustomers(s.user.role));
          switch (action) {
            case "rows":
              return stageJob(db, id, stageSchema.parse(req.body), s.user.id);
            case "confirm":
              return startJob(db, id, startSchema.parse(req.body), s.user.id);
            case "cancel":
              return cancelJob(
                db,
                id,
                expected.parse(req.body).version,
                s.user.id,
              );
            case "process":
              z.object({}).strict().parse(req.body);
              return processJob(db, id, s.user.id);
          }
        });
        res.json({ job });
      }),
    );
  }

  app.get(
    "/api/saved-designs",
    wrap(async (req, res) => {
      await readSession(req);
      res.json(await listDesigns(pool, designQuery.parse(req.query)));
    }),
  );
  app.get(
    "/api/saved-designs/:id",
    wrap(async (req, res) => {
      await readSession(req);
      const id = idSchema.parse(req.params.id);
      res.json(
        await transaction(pool, async (db) => ({
          design: await getDesign(db, id),
          activity: await businessAudit(db, id, [
            "DESIGN_CREATED",
            "DESIGN_VERSION_ADDED",
          ]),
        })),
      );
    }),
  );
  app.get(
    "/api/saved-designs/:id/versions",
    wrap(async (req, res) => {
      await readSession(req);
      const id = idSchema.parse(req.params.id);
      await getDesign(pool, id);
      res.json(
        await listDesignVersions(
          pool,
          id,
          z.object(pageFields).strict().parse(req.query),
        ),
      );
    }),
  );
  app.post(
    "/api/saved-designs",
    wrap(async (req, res) => {
      const { id, ...input } = designFields.extend(draftId).parse(req.body);
      const design = await mutation(req, (db, s) => {
        allowed(canManageDesigns(s.user.role));
        return saveDesign(db, id, input, s.user.id);
      });
      res.status(201).json({ design });
    }),
  );
  app.patch(
    "/api/saved-designs/:id",
    wrap(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      const { version, ...input } = designFields
        .extend({ version: versionSchema })
        .parse(req.body);
      const design = await mutation(req, (db, s) => {
        allowed(canManageDesigns(s.user.role));
        return saveDesign(db, id, input, s.user.id, version);
      });
      res.json({ design });
    }),
  );

  app.get(
    "/api/sales-orders",
    wrap(async (req, res) => {
      await readSession(req);
      res.json(await listSales(pool, salesQuery.parse(req.query)));
    }),
  );
  app.get(
    "/api/sales-orders/:id",
    wrap(async (req, res) => {
      await readSession(req);
      const id = idSchema.parse(req.params.id);
      res.json(await transaction(pool, (db) => salesDetail(db, id)));
    }),
  );
  app.post(
    "/api/sales-orders",
    wrap(async (req, res) => {
      const { id, ...input } = salesFields.extend(draftId).parse(req.body);
      const detail = await mutation(req, (db, s) => {
        allowed(canCreateSales(s.user.role));
        return saveSales(db, id, input, s.user);
      });
      res.status(201).json(detail);
    }),
  );
  app.patch(
    "/api/sales-orders/:id",
    wrap(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      const { version, ...input } = salesFields
        .extend({ version: versionSchema })
        .parse(req.body);
      res.json(
        await mutation(req, (db, s) => {
          allowed(canEditSales(s.user.role));
          return saveSales(db, id, input, s.user, version);
        }),
      );
    }),
  );
  for (const action of ["confirm", "cancel", "force-reopen"] as const) {
    app.post(
      "/api/sales-orders/:id/" + action,
      wrap(async (req, res) => {
        const id = idSchema.parse(req.params.id);
        const { version, reason } =
          action === "force-reopen"
            ? expected
                .extend({ reason: z.string().trim().min(1).max(500) })
                .parse(req.body)
            : { ...expected.parse(req.body), reason: "" };
        res.json(
          await mutation(req, (db, s) => {
            allowed(
              action === "force-reopen"
                ? canForceReopenSales(s.user.role)
                : canEditSales(s.user.role),
            );
            return transitionSales(db, id, version, action, s.user, reason);
          }),
        );
      }),
    );
  }
}

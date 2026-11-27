import type { Express } from "express";
import type { Pool } from "mysql2/promise";
import { canEditSales, idSchema } from "../../shared/business";
import {
  canSeeFinishing,
  canSeeShipping,
  canSeeWarehouse,
  FULFILLMENT_ACTIONS,
  SHIPMENT_ACTIONS,
  type FulfillmentAction,
  type FulfillmentInput,
} from "../../shared/fulfillment";
import type { Config } from "../config";
import { routeContext } from "../auth/context";
import { rows, transaction } from "../database/pool";
import { allowed, wrap } from "../middleware/http";
import { conflict, fingerprint } from "../repositories/business";
import {
  dispatchDetail,
  finishingDetail,
  fulfillmentQuery,
  listDispatches,
  listFinishing,
  listIssues,
  listShipments,
  listStock,
  shipmentDetail,
  stockDetail,
} from "../repositories/fulfillment";
import {
  actIssue,
  actTask,
  taskRole,
  type IssueInput,
  type TaskInput,
} from "../services/finishing-workflow";
import {
  actLogistics,
  type LogisticsInput,
} from "../services/logistics-workflow";
import { listOrderProgress, orderProgress } from "../services/sales-progress";
import { audit, changed } from "../services/audit";

const taskActions = [
  "receive",
  "assign",
  "claim",
  "start",
  "complete",
  "confirm-no-work",
  "add-note",
  "urgent",
  "request-cancel",
  "respond-cancel",
  "accept",
] as const;
const shipmentActions = [
  ...(Object.keys(SHIPMENT_ACTIONS) as (keyof typeof SHIPMENT_ACTIONS)[]),
  "inspect-return" as const,
];

export function registerFulfillmentRoutes(
  app: Express,
  pool: Pool,
  config: Config,
) {
  const { readSession, mutation } = routeContext(pool, config);

  app.get(
    "/api/finishing-tasks",
    wrap(async (req, res) => {
      const { user } = await readSession(req);
      allowed(canSeeFinishing(user.role) || canSeeWarehouse(user.role));
      const q = fulfillmentQuery.parse(req.query);
      // Warehouse can review inspection candidates and finished goods.
      if (
        user.role === "WAREHOUSE" &&
        !["COMPLETED", "CANCELLED"].includes(q.status ?? "")
      )
        q.status = "COMPLETED";
      res.json(await listFinishing(pool, q, user));
    }),
  );
  app.get(
    "/api/finishing-tasks/:id",
    wrap(async (req, res) => {
      const { user } = await readSession(req);
      allowed(canSeeFinishing(user.role) || canSeeWarehouse(user.role));
      const id = idSchema.parse(req.params.id);
      res.json(
        await transaction(pool, async (db) => {
          const detail = await finishingDetail(db, id, user);
          if (user.role === "WAREHOUSE")
            allowed(["COMPLETED", "CANCELLED"].includes(detail.entry.status));
          return detail;
        }),
      );
    }),
  );
  app.get(
    "/api/finished-goods",
    wrap(async (req, res) => {
      const { user } = await readSession(req);
      allowed(canSeeWarehouse(user.role));
      res.json(await listStock(pool, fulfillmentQuery.parse(req.query), user));
    }),
  );
  app.get(
    "/api/finished-goods/:id",
    wrap(async (req, res) => {
      const { user } = await readSession(req);
      allowed(canSeeWarehouse(user.role));
      const id = idSchema.parse(req.params.id);
      res.json(await transaction(pool, (db) => stockDetail(db, id, user)));
    }),
  );
  app.get(
    "/api/workflow-issues",
    wrap(async (req, res) => {
      const { user } = await readSession(req);
      res.json(await listIssues(pool, fulfillmentQuery.parse(req.query), user));
    }),
  );
  app.get(
    "/api/sales-orders/:id/progress",
    wrap(async (req, res) => {
      await readSession(req); // Sales reads match the Phase 02A authenticated read policy.
      const id = idSchema.parse(req.params.id);
      res.json(await transaction(pool, (db) => orderProgress(db, id)));
    }),
  );
  app.get(
    "/api/dispatch-queue",
    wrap(async (req, res) => {
      const { user } = await readSession(req);
      allowed(user.role === "WAREHOUSE" || canEditSales(user.role));
      res.json(
        await listOrderProgress(pool, fulfillmentQuery.parse(req.query)),
      );
    }),
  );
  app.get(
    "/api/warehouse-dispatches",
    wrap(async (req, res) => {
      const { user } = await readSession(req);
      allowed(canSeeShipping(user.role));
      res.json(await listDispatches(pool, fulfillmentQuery.parse(req.query)));
    }),
  );
  app.get(
    "/api/warehouse-dispatches/:id",
    wrap(async (req, res) => {
      const { user } = await readSession(req);
      allowed(canSeeShipping(user.role));
      const id = idSchema.parse(req.params.id);
      res.json(await transaction(pool, (db) => dispatchDetail(db, id)));
    }),
  );
  app.get(
    "/api/shipments",
    wrap(async (req, res) => {
      const { user } = await readSession(req);
      allowed(canSeeShipping(user.role));
      res.json(await listShipments(pool, fulfillmentQuery.parse(req.query)));
    }),
  );
  app.get(
    "/api/shipments/:id",
    wrap(async (req, res) => {
      const { user } = await readSession(req);
      allowed(canSeeShipping(user.role));
      const id = idSchema.parse(req.params.id);
      res.json(await transaction(pool, (db) => shipmentDetail(db, id)));
    }),
  );

  const groups = [
    { path: "finishing-tasks", actions: taskActions },
    { path: "fulfillment-sources", actions: ["report-issue"] },
    { path: "workflow-issues", actions: ["resolve-issue", "cancel-issue"] },
    { path: "sales-orders", actions: ["dispatch"] },
    {
      path: "warehouse-dispatches",
      actions: ["reverse-dispatch", "create-shipment"],
    },
    { path: "shipments", actions: shipmentActions },
  ] satisfies { path: string; actions: readonly FulfillmentAction[] }[];
  for (const group of groups)
    for (const action of group.actions) {
      app.post(
        `/api/${group.path}/:id/${action}`,
        wrap(async (req, res) => {
          const id = idSchema.parse(req.params.id);
          const input = {
            ...FULFILLMENT_ACTIONS[action].parse(req.body),
            action,
          } as FulfillmentInput;
          res.json(
            await mutation(req, async (db, { user }) => {
              const task = (taskActions as readonly string[]).includes(action);
              const issue = [
                "report-issue",
                "resolve-issue",
                "cancel-issue",
              ].includes(action);
              if (task) allowed(taskRole(input as TaskInput, user));
              else if (!issue)
                allowed(
                  action === "dispatch" || action === "reverse-dispatch"
                    ? user.role === "WAREHOUSE"
                    : canEditSales(user.role),
                );

              const hash = fingerprint({ id, input });
              const [receipt] = await rows(
                db,
                "SELECT * FROM fulfillment_receipts WHERE request_id=?",
                [input.requestId],
              );
              if (receipt) {
                if (
                  receipt.actor_id !== user.id ||
                  receipt.request_hash !== hash
                )
                  throw conflict(
                    "REQUEST_REUSED",
                    "Mã yêu cầu đã được sử dụng cho thao tác khác.",
                  );
                return {
                  id: receipt.result_id,
                  version: receipt.result_version,
                };
              }
              const result = task
                ? await actTask(db, id, input as TaskInput, user)
                : issue
                  ? await actIssue(db, id, input as IssueInput, user)
                  : await actLogistics(db, id, input as LogisticsInput, user);
              await audit(
                db,
                user.id,
                "FULFILLMENT_" + action.toUpperCase().replaceAll("-", "_"),
                result.id,
                {
                  sourceId: id,
                  version: result.version,
                  note: "note" in input ? input.note : "",
                },
              );
              await db.execute(
                `INSERT INTO fulfillment_receipts(request_id,actor_id,request_hash,result_id,result_version)
          VALUES(?,?,?,?,?)`,
                [input.requestId, user.id, hash, result.id, result.version],
              );
              // A workspace signal carries no specialist task, customer, or shipment identifier.
              await changed(db, "fulfillment", "workspace", 0);
              return result;
            }),
          );
        }),
      );
    }
}

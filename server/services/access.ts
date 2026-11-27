import type { Request } from "express";
import {
  defaultFeatures,
  effectivePermission,
  type AccessPolicy,
  type Capability,
  type Feature,
} from "../../shared/access";
import type { User } from "../../shared/contracts";
import { rows, type Db } from "../database/pool";
import { ApiError } from "../errors";
export async function readPolicy(db: Db): Promise<AccessPolicy> {
  const [r] = await rows(db, "SELECT * FROM access_policy WHERE id=1");
  const parse = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
  return {
    version: Number(r.version),
    features: { ...defaultFeatures, ...parse(r.features) },
    roleOverrides: parse(r.role_overrides),
    userOverrides: parse(r.user_overrides),
  };
}
export async function requireCapability(db: Db, user: User, key: Capability) {
  if (!effectivePermission(await readPolicy(db), user.role, user.id, key))
    throw new ApiError(
      403,
      "PERMISSION_DENIED",
      "Quyền thao tác đã bị giới hạn. Liên hệ kỹ thuật hệ thống.",
    );
}
export async function requireFeature(db: Db, feature: Feature) {
  if (!(await readPolicy(db)).features[feature])
    throw new ApiError(
      409,
      "FEATURE_DISABLED",
      "Phân hệ đang tạm dừng thao tác ghi. Dữ liệu lịch sử vẫn được giữ.",
    );
}
// Runs inside the same serialized transaction as the operation, with a freshly read session.
export async function enforceRequestPolicy(db: Db, req: Request, user: User) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  // Express matches routes case-insensitively and accepts a trailing slash.
  const path = req.path.toLowerCase().replace(/\/+$/, "");
  let feature: Feature | undefined;
  if (/^\/api\/(customers|customer-imports)(\/|$)/.test(path))
    feature = "customer";
  if (/^\/api\/sales-orders(\/|$)/.test(path)) feature = "salesOrder";
  if (/^\/api\/saved-designs(\/|$)/.test(path)) feature = "sampleLibrary";
  if (
    /^\/api\/warehouse-dispatches(\/|$)/.test(path) ||
    /\/sales-orders\/[^/]+\/dispatch$/.test(path)
  )
    feature = "warehouseDispatch";
  if (/\/create-shipment$/.test(path) || /^\/api\/shipments(\/|$)/.test(path))
    feature = "shipping";
  if (/\/comment$/.test(path)) feature = "comments";
  if (feature) await requireFeature(db, feature);
  let key: Capability | undefined;
  if (/^\/api\/users(?:\/|$)/.test(path) && path.split("/")[3] !== user.id)
    key = "canManageUsers";
  if (path === "/api/settings") key = "canManageWorkshopSettings";
  if (/^\/api\/finishing-tasks\//.test(path)) key = "canManageFinishing";
  if (
    /^\/api\/production-orders$/.test(path) ||
    (req.method === "PATCH" && /^\/api\/production-orders\/[^/]+$/.test(path))
  )
    key = "canCreateProductionOrder";
  if (/^\/api\/production-(?:orders|batches)\//.test(path)) {
    const action = path.split("/").at(-1)!;
    const map: Record<string, Capability> = {
      dispatch: "canDispatchOrder",
      revise: "canCreateProductionOrder",
      "link-products": "canCreateProductionOrder",
      urgent: "canToggleUrgent",
      "cancel-request": "canRequestCancel",
      "cancel-respond": "canApproveCancel",
      accept: "canAcceptPrintJob",
      acknowledge: "canAcceptPrintJob",
      "wait-print": "canAcceptPrintJob",
      start: "canStartPrinting",
      complete: "canFinishPrinting",
      "plate-send": "canMarkPlateReady",
      "plate-receive": "canMarkPlateReady",
      "plate-report": "canMarkPlateReady",
      "plate-reissue": "canMarkPlateReady",
      "issue-report": "canReportIssue",
      "issue-assign": "canResolveIssue",
      "issue-resolve": "canResolveIssue",
      "issue-cancel": "canResolveIssue",
    };
    key = map[action] ?? key;
  }
  if (/\/report-issue$/.test(path)) key = "canReportIssue";
  if (/\/(resolve-issue|cancel-issue)$/.test(path)) key = "canResolveIssue";
  if (key) await requireCapability(db, user, key);
  if (
    (path === "/api/production-orders" ||
      (req.method === "PATCH" &&
        /^\/api\/production-orders\/[^/]+$/.test(path))) &&
    typeof (req.body?.isUrgent ?? false) === "boolean"
  ) {
    const id = req.method === "PATCH" ? path.split("/")[3] : req.body.id;
    const [order] = await rows(
      db,
      "SELECT is_urgent FROM production_orders WHERE id=?",
      [id],
    );
    if ((req.body.isUrgent ?? false) !== Boolean(order?.is_urgent))
      await requireCapability(db, user, "canToggleUrgent");
  }
}

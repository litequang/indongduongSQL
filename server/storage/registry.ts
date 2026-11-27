import { canManageTarget, type User } from "../../shared/contracts";
import { getUser } from "../repositories/users";
import { requireCapability, requireFeature } from "../services/access";
import { canManageDesigns } from "../../shared/business";
import { canComposeProduction } from "../../shared/production";
import { rows, type Db } from "../database/pool";
import { allowed } from "../middleware/http";
import { ApiError } from "../errors";
export async function targetAuthority(
  db: Db,
  type: string,
  id: string,
  actor: User,
  write: boolean,
) {
  if (type === "AVATAR") {
    const target = await getUser(db, id);
    if (!target) return false;
    if (write && actor.id !== id) {
      allowed(canManageTarget(actor.role, target.role));
      await requireCapability(db, actor, "canManageUsers");
    }
    return true;
  }
  if (type === "DESIGN") {
    if (write) {
      allowed(canManageDesigns(actor.role));
      await requireFeature(db, "sampleLibrary");
    }
    const [design] = await rows(db, "SELECT id FROM saved_designs WHERE id=?", [
      id,
    ]);
    if (!design && !write) return false;
    return true;
  }
  const [order] = await rows(
    db,
    "SELECT status,created_by,printer_id FROM production_orders WHERE id=?",
    [id],
  );
  if (!order) {
    if (write) {
      allowed(canComposeProduction(actor.role));
      await requireCapability(db, actor, "canCreateProductionOrder");
      return true;
    }
    return false;
  }
  if (order.status === "DRAFT" && order.created_by !== actor.id) return false;
  if (
    actor.role === "PRINTER" &&
    (order.status === "DRAFT" || order.printer_id !== actor.id)
  )
    return false;
  if (write) {
    allowed(canComposeProduction(actor.role));
    await requireCapability(db, actor, "canCreateProductionOrder");
    if (order.status !== "DRAFT" || order.created_by !== actor.id) return false;
  }
  return true;
}
export async function registryImage(
  db: Db,
  id: string,
  actor: User,
  write = false,
) {
  const [image] = await rows(
    db,
    "SELECT * FROM image_registry WHERE id=? AND status<>'DELETED'",
    [id],
  );
  if (!image) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy ảnh.");
  if (write && image.owner_id !== actor.id)
    throw new ApiError(404, "NOT_FOUND", "Không tìm thấy ảnh.");
  const [linked] = await rows(
    db,
    `SELECT id FROM design_versions WHERE image_registry_id=? UNION ALL SELECT id FROM production_print_images WHERE image_registry_id=? UNION ALL SELECT id FROM users WHERE avatar_registry_id=? LIMIT 1`,
    [id, id, id],
  );
  if (!linked && image.owner_id !== actor.id)
    throw new ApiError(404, "NOT_FOUND", "Không tìm thấy ảnh.");
  allowed(
    await targetAuthority(db, image.target_type, image.target_id, actor, write),
  );
  return image;
}
export async function validateImageLink(
  db: Db,
  id: string | null | undefined,
  type: string,
  target: string,
  actor: string,
) {
  if (!id) return;
  const [image] = await rows(
    db,
    "SELECT * FROM image_registry WHERE id=? AND status='ACTIVE'",
    [id],
  );
  if (!image || image.target_type !== type || image.target_id !== target)
    throw new ApiError(
      409,
      "IMAGE_NOT_READY",
      "Ảnh chưa được xác minh hoặc thuộc bản ghi khác.",
    );
  // Existing references can be reused by authorized editors; unattached uploads remain owner private.
  const [linked] = await rows(
    db,
    "SELECT id FROM design_versions WHERE image_registry_id=? UNION ALL SELECT id FROM production_print_images WHERE image_registry_id=? UNION ALL SELECT id FROM users WHERE avatar_registry_id=? LIMIT 1",
    [id, id, id],
  );
  if (!linked && image.owner_id !== actor)
    throw new ApiError(403, "FORBIDDEN", "Ảnh thuộc người dùng khác.");
}

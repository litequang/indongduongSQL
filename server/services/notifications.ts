import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { rows } from "../database/pool";
import type { ChangeEntity } from "../../shared/contracts";
export async function notifyChange(
  db: PoolConnection,
  entity: ChangeEntity,
  entityId: string,
  sequence: string,
) {
  let recipients: RowDataPacket[] = [];
  if (entity === "production_orders") {
    recipients = await rows(
      db,
      `SELECT u.id FROM users u JOIN production_orders p ON p.id=? WHERE u.active=1 AND u.deleted_at IS NULL AND
      ((p.status='DRAFT' AND p.created_by=u.id) OR (p.status<>'DRAFT' AND (u.role_code<>'PRINTER' OR p.printer_id=u.id) AND
      (u.id=p.created_by OR u.id=p.printer_id OR EXISTS(SELECT 1 FROM production_issues i WHERE i.order_id=p.id AND i.status='OPEN' AND
      (EXISTS(SELECT 1 FROM production_issue_users iu WHERE iu.issue_id=i.id AND iu.user_id=u.id) OR EXISTS(SELECT 1 FROM production_issue_roles ir WHERE ir.issue_id=i.id AND (ir.role_code=u.role_code OR (ir.role_code='MANAGER' AND u.role_code IN ('ADMIN','DEVELOPER')) OR (ir.role_code='ADMIN' AND u.role_code='DEVELOPER'))))))))`,
      [entityId],
    );
  } else if (entity === "sales_orders") {
    recipients = await rows(
      db,
      `SELECT u.id FROM users u JOIN sales_orders s ON s.id=? WHERE u.id=s.sale_id AND u.active=1 AND u.deleted_at IS NULL`,
      [entityId],
    );
  } else if (entity === "fulfillment") {
    // Workspace invalidation is deliberately a generic alert: no inaccessible task identity or payload.
    recipients = await rows(
      db,
      "SELECT id FROM users WHERE active=1 AND deleted_at IS NULL AND role_code IN ('FINISHER','WAREHOUSE')",
    );
  }
  for (const user of recipients)
    await db.execute(
      "INSERT INTO notifications(id,user_id,event_sequence,entity,entity_id) VALUES(?,?,?,?,?)",
      [randomUUID(), user.id, sequence, entity, entityId],
    );
}

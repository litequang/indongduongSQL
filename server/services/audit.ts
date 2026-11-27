import type { ChangeEntity } from "../../shared/contracts";
import type { PoolConnection } from "mysql2/promise";
import { rows } from "../database/pool";
import { notifyChange } from "./notifications";
export async function audit(
  db: PoolConnection,
  actorId: string | null,
  action: string,
  entityId: string,
  details: Record<string, unknown> = {},
) {
  await db.execute(
    "INSERT INTO audit_logs(actor_id,action,entity_id,details) VALUES(?,?,?,?)",
    [actorId, action, entityId, JSON.stringify(details)],
  );
}
// Caller holds system_state lock before ANY mutation. No auto-increment cursor gaps.
export async function changed(
  db: PoolConnection,
  entity: ChangeEntity,
  entityId: string,
  version: number,
  deleted = false,
) {
  await db.execute(
    "UPDATE system_state SET change_sequence=change_sequence+1 WHERE id=1",
  );
  const [state] = await rows(
    db,
    "SELECT change_sequence FROM system_state WHERE id=1",
  );
  await db.execute(
    "INSERT INTO change_events(sequence,entity,entity_id,record_version,deleted) VALUES(?,?,?,?,?)",
    [state.change_sequence, entity, entityId, version, deleted],
  );
  await notifyChange(db, entity, entityId, String(state.change_sequence));
}

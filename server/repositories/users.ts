import type { RowDataPacket } from "mysql2/promise";
import type { User } from "../../shared/contracts";
import { rows, type Db } from "../database/pool";
export const userColumns =
  "id,username,name,phone,role_code,machine_assigned,active,version,created_at,updated_at";
export function toUser(r: RowDataPacket): User {
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    phone: r.phone,
    role: r.role_code,
    machineAssigned: r.machine_assigned,
    active: Boolean(r.active),
    version: Number(r.version),
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}
export async function getUser(db: Db, id: string) {
  const [r] = await rows(
    db,
    `SELECT ${userColumns} FROM users WHERE id=? AND deleted_at IS NULL`,
    [id],
  );
  return r ? toUser(r) : null;
}

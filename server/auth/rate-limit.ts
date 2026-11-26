import type { Pool } from "mysql2/promise";
import { rows, transaction } from "../database/pool";
import { digest } from "./password";
import { ApiError } from "../errors";
// Shared database counters survive restarts and cover all Passenger processes.
export async function consumeLimit(
  pool: Pool,
  bucket: string,
  maximum: number,
) {
  const exceeded = await transaction(pool, async (db) => {
    const key = digest(bucket);
    await db.execute(
      "INSERT INTO auth_rate_limits(bucket_hash,hits,expires_at) VALUES(?,1,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 15 MINUTE)) ON DUPLICATE KEY UPDATE hits=IF(expires_at<=UTC_TIMESTAMP(3),1,hits+1),expires_at=IF(expires_at<=UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 15 MINUTE),expires_at)",
      [key],
    );
    const [r] = await rows(
      db,
      "SELECT hits FROM auth_rate_limits WHERE bucket_hash=?",
      [key],
    );
    return Number(r.hits) > maximum;
  });
  if (exceeded)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.",
    );
}
let expensiveOperations = 0;
export async function passwordWork<T>(operation: () => Promise<T>) {
  if (expensiveOperations >= 2)
    throw new ApiError(
      503,
      "AUTH_BUSY",
      "Hệ thống đang bận. Thử lại sau ít giây.",
    );
  expensiveOperations++;
  try {
    return await operation();
  } finally {
    expensiveOperations--;
  }
}

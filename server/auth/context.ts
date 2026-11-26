import type { Request } from "express";
import type { Pool, PoolConnection } from "mysql2/promise";
import type { Config } from "../config";
import { transaction, lockState } from "../database/pool";
import { sessionFor, requireCsrf, type Session } from "./session";
import { consumeLimit } from "./rate-limit";
export function routeContext(pool: Pool, config: Config) {
  const readSession = (req: Request) => sessionFor(pool, req, config);
  const mutation = async <T>(
    req: Request,
    run: (db: PoolConnection, s: Session) => Promise<T>,
  ) =>
    transaction(pool, async (db) => {
      await lockState(db);
      const s = await sessionFor(db, req, config);
      requireCsrf(req, s);
      return run(db, s);
    });
  const limited = (req: Request, scope: string, maximum: number) =>
    consumeLimit(pool, `${scope}:ip:${req.ip}`, maximum);
  return { readSession, mutation, limited };
}

import type { Express } from "express";
import type { Pool } from "mysql2/promise";
import type { Config } from "../config";
import { routeContext } from "../auth/context";
import { wrap, allowed, fresh } from "../middleware/http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { rows, transaction } from "../database/pool";
import { ApiError } from "../errors";
import {
  createUserSchema,
  updateUserSchema,
  pageSchema,
  passwordSchema,
} from "../validation";
import { canManageTarget, canManageUsers } from "../../shared/contracts";
import { requireCsrf, clearCookie } from "../auth/session";
import { hashPassword } from "../auth/password";
import { passwordWork } from "../auth/rate-limit";
import { getUser, userColumns, toUser } from "../repositories/users";
import { audit, changed } from "../services/audit";
import { validateImageLink } from "../storage/registry";
export function registerUserRoutes(app: Express, pool: Pool, config: Config) {
  const { readSession, mutation } = routeContext(pool, config);
  app.get(
    "/api/users",
    wrap(async (req, res) => {
      await readSession(req);
      const q = pageSchema.parse(req.query);
      const clauses = ["deleted_at IS NULL"];
      const args: unknown[] = [];
      if (q.search) {
        clauses.push("(name LIKE ? OR username LIKE ? OR phone LIKE ?)");
        const search = `%${q.search.replace(/[\\%_]/g, "\\$&")}%`;
        args.push(search, search, search);
      }
      if (q.role) {
        clauses.push("role_code=?");
        args.push(q.role);
      }
      if (q.active) {
        clauses.push("active=?");
        args.push(q.active === "true");
      }
      const where = clauses.join(" AND ");
      const sort = {
        name: "name",
        username: "username",
        role: "role_code",
        createdAt: "created_at",
      }[q.sort];
      const result = await transaction(pool, async (db) => {
        const [total] = await rows(
          db,
          `SELECT COUNT(*) AS n FROM users WHERE ${where}`,
          args,
        );
        const items = await rows(
          db,
          `SELECT ${userColumns} FROM users WHERE ${where} ORDER BY ${sort} ${q.direction === "desc" ? "DESC" : "ASC"},id LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
          args,
        );
        return {
          items: items.map(toUser),
          total: Number(total.n),
          page: q.page,
          pageSize: q.pageSize,
        };
      });
      res.json(result);
    }),
  );
  app.post(
    "/api/users",
    wrap(async (req, res) => {
      const actor = await readSession(req);
      requireCsrf(req, actor);
      allowed(canManageUsers(actor.user.role));
      const input = createUserSchema.parse(req.body);
      allowed(canManageTarget(actor.user.role, input.role));
      const hash = await passwordWork(() => hashPassword(input.password));
      const user = await mutation(req, async (db, s) => {
        allowed(
          canManageUsers(s.user.role) &&
            canManageTarget(s.user.role, input.role),
        );
        const id = randomUUID();
        await db.execute(
          "INSERT INTO users(id,username,name,phone,role_code,machine_assigned,password_hash,active) VALUES(?,?,?,?,?,?,?,?)",
          [
            id,
            input.username,
            input.name,
            input.phone,
            input.role,
            input.machineAssigned,
            hash,
            input.active,
          ],
        );
        await audit(db, s.user.id, "USER_CREATED", id, { role: input.role });
        await changed(db, "users", id, 1);
        return getUser(db, id);
      });
      res.status(201).json({ user });
    }),
  );
  app.patch(
    "/api/users/:id",
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const input = updateUserSchema.parse(req.body);
      const user = await mutation(req, async (db, s) => {
        const target = await getUser(db, id);
        if (!target)
          throw new ApiError(404, "NOT_FOUND", "Không tìm thấy nhân viên.");
        const self = id === s.user.id;
        if (self)
          allowed(input.role === undefined && input.active === undefined);
        else allowed(canManageTarget(s.user.role, target.role));
        if (input.role) allowed(canManageTarget(s.user.role, input.role));
        fresh(target.version, input.version);
        if (input.avatarRegistryId)
          await validateImageLink(
            db,
            input.avatarRegistryId,
            "AVATAR",
            id,
            s.user.id,
          );
        if (
          target.role === "DEVELOPER" &&
          target.active &&
          ((input.role && input.role !== "DEVELOPER") || input.active === false)
        ) {
          const [count] = await rows(
            db,
            "SELECT COUNT(*) AS n FROM users WHERE role_code='DEVELOPER' AND active=TRUE AND deleted_at IS NULL",
          );
          if (Number(count.n) <= 1)
            throw new ApiError(
              409,
              "LAST_DEVELOPER",
              "Phải giữ ít nhất một tài khoản Developer hoạt động.",
            );
        }
        await db.execute(
          "UPDATE users SET name=?,phone=?,role_code=?,machine_assigned=?,active=?,avatar_registry_id=?,version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE id=?",
          [
            input.name ?? target.name,
            input.phone ?? target.phone,
            input.role ?? target.role,
            input.machineAssigned ?? target.machineAssigned,
            input.active ?? target.active,
            input.avatarRegistryId === undefined
              ? target.avatarRegistryId
              : input.avatarRegistryId,
            id,
          ],
        );
        if (input.role !== undefined || input.active !== undefined)
          await db.execute("DELETE FROM sessions WHERE user_id=?", [id]);
        await audit(
          db,
          s.user.id,
          self ? "PROFILE_UPDATED" : "USER_UPDATED",
          id,
          { role: input.role, active: input.active },
        );
        await changed(db, "users", id, target.version + 1);
        return getUser(db, id);
      });
      res.json({ user });
    }),
  );
  app.post(
    "/api/users/:id/reset-password",
    wrap(async (req, res) => {
      const actor = await readSession(req);
      requireCsrf(req, actor);
      allowed(canManageUsers(actor.user.role));
      const input = z
        .object({
          password: passwordSchema,
          version: z.number().int().positive(),
        })
        .strict()
        .parse(req.body);
      const id = z.string().uuid().parse(req.params.id);
      const hash = await passwordWork(() => hashPassword(input.password));
      await mutation(req, async (db, s) => {
        const target = await getUser(db, id);
        if (!target)
          throw new ApiError(404, "NOT_FOUND", "Không tìm thấy nhân viên.");
        allowed(id !== s.user.id && canManageTarget(s.user.role, target.role));
        fresh(target.version, input.version);
        await db.execute(
          "UPDATE users SET password_hash=?,version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE id=?",
          [hash, id],
        );
        await db.execute("DELETE FROM sessions WHERE user_id=?", [id]);
        await audit(db, s.user.id, "PASSWORD_RESET", id);
        await changed(db, "users", id, target.version + 1);
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/users/:id/revoke-sessions",
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      z.object({}).strict().parse(req.body);
      const revokedSelf = await mutation(req, async (db, s) => {
        const target = await getUser(db, id);
        if (!target)
          throw new ApiError(404, "NOT_FOUND", "Không tìm thấy nhân viên.");
        allowed(id === s.user.id || canManageTarget(s.user.role, target.role));
        await db.execute("DELETE FROM sessions WHERE user_id=?", [id]);
        await audit(db, s.user.id, "SESSIONS_REVOKED", id);
        return id === s.user.id;
      });
      if (revokedSelf) clearCookie(res, config);
      res.json({ ok: true });
    }),
  );
}

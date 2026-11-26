import type { Express } from "express";
import type { Pool } from "mysql2/promise";
import type { Config } from "../config";
import { routeContext } from "../auth/context";
import { wrap } from "../middleware/http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { rows, transaction, lockState } from "../database/pool";
import { isReady } from "../database/migrate";
import { ApiError } from "../errors";
import { bootstrapSchema, loginSchema, passwordSchema } from "../validation";
import {
  hashPassword,
  verifyPassword,
  equalSecret,
  randomToken,
} from "../auth/password";
import {
  cookieToken,
  requireCsrf,
  newSession,
  setCookie,
  clearCookie,
} from "../auth/session";
import { consumeLimit, passwordWork } from "../auth/rate-limit";
import { getUser } from "../repositories/users";
import { initialSettings, writeSettings } from "../repositories/settings";
import { audit, changed } from "../services/audit";
export async function registerAuthRoutes(
  app: Express,
  pool: Pool,
  config: Config,
) {
  const { readSession, mutation, limited } = routeContext(pool, config);
  const dummyHash = await hashPassword(randomToken());
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get(
    "/api/ready",
    wrap(async (_req, res) => {
      let ready = false;
      try {
        ready = await isReady(pool);
      } catch {
        /* readiness deliberately contains no DB details */
      }
      res.status(ready ? 200 : 503).json({ ready });
    }),
  );
  app.get(
    "/api/setup/status",
    wrap(async (_req, res) => {
      const [s] = await rows(
        pool,
        "SELECT initialized_at FROM system_state WHERE id=1",
      );
      res.json({
        initialized: Boolean(s.initialized_at),
        setupEnabled: Boolean(config.SETUP_SECRET) && !s.initialized_at,
      });
    }),
  );
  app.post(
    "/api/setup/bootstrap",
    wrap(async (req, res) => {
      await limited(req, "setup", 10);
      const input = bootstrapSchema.parse(req.body);
      if (
        !config.SETUP_SECRET ||
        !equalSecret(input.setupSecret, config.SETUP_SECRET)
      )
        throw new ApiError(403, "SETUP_DENIED", "Khóa thiết lập không hợp lệ.");
      const hash = await passwordWork(() => hashPassword(input.password));
      await transaction(pool, async (db) => {
        const state = await lockState(db);
        const [count] = await rows(db, "SELECT COUNT(*) AS n FROM users");
        if (state.initialized_at || Number(count.n) > 0)
          throw new ApiError(
            409,
            "ALREADY_INITIALIZED",
            "Hệ thống đã được thiết lập.",
          );
        const id = randomUUID();
        await db.execute(
          "INSERT INTO users(id,username,name,role_code,password_hash) VALUES(?,?,?,'DEVELOPER',?)",
          [id, input.username, input.name, hash],
        );
        await writeSettings(db, initialSettings(input.companyName), true);
        await db.execute(
          "UPDATE system_state SET initialized_at=UTC_TIMESTAMP(3) WHERE id=1",
        );
        await audit(db, id, "SYSTEM_BOOTSTRAPPED", id);
        await changed(db, "users", id, 1);
        await changed(db, "settings", "1", 1);
      });
      res.status(201).json({ initialized: true });
    }),
  );
  app.post(
    "/api/auth/login",
    wrap(async (req, res) => {
      await limited(req, "login", 50);
      const input = loginSchema.parse(req.body);
      await consumeLimit(pool, `login:user:${input.username}`, 10);
      const [candidate] = await rows(
        pool,
        "SELECT id,password_hash,active FROM users WHERE username=? AND deleted_at IS NULL",
        [input.username],
      );
      const valid = await passwordWork(() =>
        verifyPassword(input.password, candidate?.password_hash || dummyHash),
      );
      if (!candidate || !valid || !candidate.active)
        throw new ApiError(
          401,
          "INVALID_CREDENTIALS",
          "Tên đăng nhập hoặc mật khẩu không đúng.",
        );
      const result = await transaction(pool, async (db) => {
        await lockState(db);
        const [current] = await rows(
          db,
          "SELECT password_hash,active FROM users WHERE id=? AND deleted_at IS NULL",
          [candidate.id],
        );
        if (
          !current?.active ||
          !equalSecret(current.password_hash, candidate.password_hash)
        )
          throw new ApiError(
            401,
            "INVALID_CREDENTIALS",
            "Tên đăng nhập hoặc mật khẩu không đúng.",
          );
        const prior = cookieToken(req, config);
        if (prior) {
          const { digest } = await import("../auth/password");
          await db.execute("DELETE FROM sessions WHERE token_hash=?", [
            digest(prior),
          ]);
        }
        await db.execute(
          "DELETE FROM sessions WHERE expires_at<=UTC_TIMESTAMP(3) LIMIT 100",
        );
        await db.execute(
          "DELETE FROM auth_rate_limits WHERE expires_at<=UTC_TIMESTAMP(3) LIMIT 100",
        );
        const session = await newSession(db, candidate.id, config);
        await audit(db, candidate.id, "LOGIN", candidate.id);
        return { session, user: await getUser(db, candidate.id) };
      });
      setCookie(res, config, result.session);
      res.json({ user: result.user, csrfToken: result.session.csrfToken });
    }),
  );
  app.get(
    "/api/auth/me",
    wrap(async (req, res) => {
      const s = await readSession(req);
      res.json({ user: s.user, csrfToken: s.csrfToken });
    }),
  );
  app.post(
    "/api/auth/logout",
    wrap(async (req, res) => {
      await mutation(req, async (db, s) => {
        await db.execute("DELETE FROM sessions WHERE token_hash=?", [
          s.tokenHash,
        ]);
        await audit(db, s.user.id, "LOGOUT", s.user.id);
      });
      clearCookie(res, config);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/auth/change-password",
    wrap(async (req, res) => {
      const input = z
        .object({
          currentPassword: z.string().min(1).max(128),
          newPassword: passwordSchema,
        })
        .strict()
        .parse(req.body);
      const current = await readSession(req);
      requireCsrf(req, current);
      await consumeLimit(pool, `change-password:${current.user.id}`, 10);
      const [record] = await rows(
        pool,
        "SELECT password_hash FROM users WHERE id=?",
        [current.user.id],
      );
      const ok = await passwordWork(() =>
        verifyPassword(input.currentPassword, record.password_hash),
      );
      if (!ok)
        throw new ApiError(
          400,
          "PASSWORD_INCORRECT",
          "Mật khẩu hiện tại không đúng.",
        );
      const hash = await passwordWork(() => hashPassword(input.newPassword));
      await mutation(req, async (db, s) => {
        const [now] = await rows(
          db,
          "SELECT password_hash FROM users WHERE id=?",
          [s.user.id],
        );
        if (now.password_hash !== record.password_hash)
          throw new ApiError(
            409,
            "PASSWORD_CHANGED",
            "Mật khẩu đã thay đổi. Đăng nhập lại.",
          );
        await db.execute(
          "UPDATE users SET password_hash=?,version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE id=?",
          [hash, s.user.id],
        );
        await db.execute("DELETE FROM sessions WHERE user_id=?", [s.user.id]);
        await audit(db, s.user.id, "PASSWORD_CHANGED", s.user.id);
        await changed(db, "users", s.user.id, s.user.version + 1);
      });
      clearCookie(res, config);
      res.json({ ok: true, reauthenticate: true });
    }),
  );
}

import type { Express } from "express";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import {
  CAPABILITIES,
  FEATURES,
  FEATURE_DEPENDENCIES,
  capabilityCeiling,
  effectivePermission,
  type AccessPolicy,
} from "../../shared/access";
import { ROLES } from "../../shared/contracts";
import type { Config } from "../config";
import { routeContext } from "../auth/context";
import { wrap, allowed, fresh } from "../middleware/http";
import { readPolicy } from "../services/access";
import { rows, transaction } from "../database/pool";
import { ApiError } from "../errors";
import { audit, changed } from "../services/audit";
const overrides = z
  .object(
    Object.fromEntries(
      Object.keys(CAPABILITIES).map((k) => [k, z.boolean().optional()]),
    ),
  )
  .strict();
const inputSchema = z
  .object({
    version: z.number().int().positive(),
    features: z
      .object(
        Object.fromEntries(Object.keys(FEATURES).map((k) => [k, z.boolean()])),
      )
      .strict(),
    roleOverrides: z.partialRecord(z.enum(ROLES), overrides),
    userOverrides: z
      .record(z.string().uuid(), overrides)
      .refine((v) => Object.keys(v).length <= 500),
  })
  .strict();
export function registerAccessRoutes(app: Express, pool: Pool, config: Config) {
  const { readSession, mutation } = routeContext(pool, config);
  app.get(
    "/api/access",
    wrap(async (req, res) => {
      const s = await readSession(req);
      const policy = await transaction(pool, (db) => readPolicy(db));
      res.json({
        version: policy.version,
        features: policy.features,
        permissions: Object.fromEntries(
          Object.keys(CAPABILITIES).map((k) => [
            k,
            effectivePermission(
              policy,
              s.user.role,
              s.user.id,
              k as keyof typeof CAPABILITIES,
            ),
          ]),
        ),
        ...(s.user.role === "DEVELOPER" ? { policy } : {}),
      });
    }),
  );
  app.put(
    "/api/access",
    wrap(async (req, res) => {
      const input = inputSchema.parse(req.body) as AccessPolicy;
      const result = await mutation(req, async (db, s) => {
        allowed(s.user.role === "DEVELOPER");
        const current = await readPolicy(db);
        fresh(current.version, input.version);
        if (!input.features.production || !input.features.finishing)
          throw new ApiError(
            400,
            "CORE_FEATURE",
            "Sản xuất và gia công là phân hệ lõi.",
          );
        for (const [key, deps] of Object.entries(FEATURE_DEPENDENCIES)) {
          if (
            input.features[key as keyof typeof FEATURES] &&
            deps.some((k) => !input.features[k])
          )
            throw new ApiError(
              400,
              "FEATURE_DEPENDENCY",
              "Bật các phân hệ phụ thuộc trước, hoặc tắt phân hệ sử dụng chúng.",
            );
        }
        const users = await rows(
          db,
          "SELECT id,role_code FROM users WHERE deleted_at IS NULL",
        );
        for (const [role, permissions] of Object.entries(input.roleOverrides)) {
          for (const [key, enabled] of Object.entries(permissions!))
            if (
              enabled &&
              !capabilityCeiling(
                role as (typeof ROLES)[number],
                key as keyof typeof CAPABILITIES,
              )
            )
              throw new ApiError(
                400,
                "ROLE_CEILING",
                "Không thể cấp quyền vượt vai trò.",
              );
        }
        for (const [id, permissions] of Object.entries(input.userOverrides)) {
          const u = users.find((u) => u.id === id);
          if (!u)
            throw new ApiError(400, "UNKNOWN_USER", "Nhân viên không tồn tại.");
          for (const [key, enabled] of Object.entries(permissions))
            if (
              enabled &&
              !capabilityCeiling(u.role_code, key as keyof typeof CAPABILITIES)
            )
              throw new ApiError(
                400,
                "ROLE_CEILING",
                "Không thể cấp quyền vượt vai trò.",
              );
        }
        for (const u of users) {
          if (
            Object.keys(CAPABILITIES).some(
              (k) =>
                effectivePermission(
                  current,
                  u.role_code,
                  u.id,
                  k as keyof typeof CAPABILITIES,
                ) !==
                effectivePermission(
                  input,
                  u.role_code,
                  u.id,
                  k as keyof typeof CAPABILITIES,
                ),
            )
          )
            await db.execute("DELETE FROM sessions WHERE user_id=?", [u.id]);
        }
        await db.execute(
          "UPDATE access_policy SET version=version+1,features=?,role_overrides=?,user_overrides=? WHERE id=1",
          [
            JSON.stringify(input.features),
            JSON.stringify(input.roleOverrides),
            JSON.stringify(input.userOverrides),
          ],
        );
        await audit(db, s.user.id, "ACCESS_POLICY_UPDATED", "1", {
          version: current.version + 1,
        });
        await changed(db, "settings", "access", current.version + 1);
        return { ...input, version: current.version + 1 };
      });
      res.json({ policy: result });
    }),
  );
}

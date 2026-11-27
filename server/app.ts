import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import type { Pool } from "mysql2/promise";
import type { Config } from "./config";
import { ApiError, errorHandler } from "./errors";
import { requireOrigin } from "./auth/session";
import { registerAuthRoutes } from "./routes/auth";
import { registerUserRoutes } from "./routes/users";
import { registerSettingsRoutes } from "./routes/settings";
import { registerBusinessRoutes } from "./routes/business";
import { registerProductionRoutes } from "./routes/production";
import { registerFulfillmentRoutes } from "./routes/fulfillment";
import {
  registerImageUpload,
  registerPrivateOperations,
} from "./routes/private-operations";
import { r2Store, type ObjectStore } from "./storage/objects";
export async function createApp(
  pool: Pool,
  config: Config,
  objects?: ObjectStore | null,
) {
  if (objects && config.NODE_ENV !== "test")
    throw new Error("Storage injection is test-only");
  const store =
    objects === undefined
      ? config.NODE_ENV === "test"
        ? null
        : r2Store()
      : objects;
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY_HOPS);
  app.use(
    helmet({
      contentSecurityPolicy:
        config.NODE_ENV === "production"
          ? {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "blob:"],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"],
                upgradeInsecureRequests: [],
              },
            }
          : false,
    }),
  );
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store, private");
    res.set("Pragma", "no-cache");
    next();
  });
  registerImageUpload(app, pool, config, store);
  const standardJson = express.json({ limit: "64kb", strict: true });
  const businessJson = express.json({
    limit: "512kb",
    strict: true,
    inflate: false,
  });
  app.use("/api", (req, res, next) => {
    const largeBusinessRequest =
      (req.method === "POST" &&
        /^\/(?:sales-orders\/?$|shipments\/[^/]+\/inspect-return\/?$|production-orders\/?$|customer-imports\/[^/]+\/rows\/?$)/i.test(
          req.path,
        )) ||
      (req.method === "PATCH" &&
        /^\/(?:sales-orders|production-orders)\/[^/]+\/?$/i.test(req.path));
    if (!largeBusinessRequest) return standardJson(req, res, next);
    try {
      requireOrigin(req, config);
      businessJson(req, res, next);
    } catch (error) {
      next(error);
    }
  });
  // Body parsing precedes Origin so malformed payload errors remain consistent.
  app.use("/api", (req, res, next) => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        requireOrigin(req, config);
        if (!req.is("application/json"))
          throw new ApiError(415, "JSON_REQUIRED", "Yêu cầu nội dung JSON.");
      }
      next();
    } catch (e) {
      next(e);
    }
  });
  await registerAuthRoutes(app, pool, config);
  registerUserRoutes(app, pool, config);
  registerSettingsRoutes(app, pool, config);
  registerBusinessRoutes(app, pool, config);
  registerProductionRoutes(app, pool, config);
  registerFulfillmentRoutes(app, pool, config);
  registerPrivateOperations(app, pool, config, store);
  app.use("/api", (_req, res) =>
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "API chưa khả dụng." } }),
  );
  app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof ApiError && error.status === 429)
      res.set("Retry-After", "900");
    if (error instanceof ApiError && error.status === 503)
      res.set("Retry-After", "3");
    errorHandler(error, req, res, next);
  });
  return app;
}

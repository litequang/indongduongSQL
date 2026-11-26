import express from "express";
import path from "node:path";
import { loadConfig } from "./server/config";
import { createPool, assertDatabase } from "./server/database/pool";
import { isReady } from "./server/database/migrate";
import { createApp } from "./server/app";
async function start() {
  const config = loadConfig();
  const pool = createPool(config);
  try {
    await assertDatabase(pool, config.DB_NAME);
    if (!(await isReady(pool)))
      throw new Error("Schema is not ready. Run npm run db:migrate.");
    const app = await createApp(pool, config);
    if (config.NODE_ENV === "development") {
      const { createServer } = await import("vite");
      const vite = await createServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const directory = path.resolve("dist");
      app.use(
        express.static(directory, {
          index: false,
          setHeaders: (res, file) => {
            res.setHeader(
              "Cache-Control",
              file.includes(`${path.sep}assets${path.sep}`)
                ? "public,max-age=31536000,immutable"
                : "no-cache",
            );
          },
        }),
      );
      app.get("*", (req, res) => {
        if (path.extname(req.path)) {
          res.status(404).end();
          return;
        }
        res.set("Cache-Control", "no-store");
        res.sendFile(path.join(directory, "index.html"));
      });
    }
    const port = /^\d+$/.test(config.PORT) ? Number(config.PORT) : config.PORT;
    const server =
      typeof port === "number"
        ? app.listen(port, config.HOST)
        : app.listen(port);
    server.on("listening", () =>
      console.log(`In Dong Duong SQL listening (${config.NODE_ENV}).`),
    );
    server.on("error", () => {
      console.error("HTTP startup failed.");
      void pool.end();
      process.exitCode = 1;
    });
    const stop = () => {
      server.close(() => {
        void pool.end().then(() => process.exit(0));
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  } catch (error) {
    await pool.end();
    console.error(
      error instanceof Error && error.message.startsWith("Schema")
        ? error.message
        : "Startup failed. Check private environment, database and migrations.",
    );
    process.exitCode = 1;
  }
}
void start().catch(() => {
  console.error("Startup configuration failed. Check the private environment.");
  process.exitCode = 1;
});

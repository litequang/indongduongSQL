import express, { type Express } from "express";
import path from "node:path";
import type { Config } from "./config";
export async function mountFrontend(app: Express, config: Config) {
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
        setHeaders: (res, file) =>
          res.setHeader(
            "Cache-Control",
            file.includes(`${path.sep}assets${path.sep}`)
              ? "public,max-age=31536000,immutable"
              : "no-cache",
          ),
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
}

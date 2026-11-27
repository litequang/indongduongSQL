import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { setTimeout } from "node:timers/promises";
// Optional portable Windows helper. The machine-specific executable/config remain private.
const executable = process.env.MARIADB_EXECUTABLE;
const config = process.env.MARIADB_CONFIG;
if (!executable || !config || !existsSync(executable) || !existsSync(config))
  throw new Error(
    "Configure private MARIADB_EXECUTABLE and MARIADB_CONFIG, or start your dedicated MariaDB service manually.",
  );
if (process.platform === "win32") {
  const child = spawn(executable, [`--defaults-file=${config}`], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  child.on("error", () => {});
  const ready = () =>
    new Promise((resolve) => {
      const socket = createConnection({
        host: process.env.DB_HOST || "127.0.0.1",
        port: Number(process.env.DB_PORT || 3307),
      });
      socket.setTimeout(500);
      const finish = (value) => {
        socket.destroy();
        resolve(value);
      };
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
      socket.once("timeout", () => finish(false));
    });
  const deadline = Date.now() + 30000;
  while (!(await ready())) {
    if (Date.now() >= deadline)
      throw new Error(
        "Dedicated MariaDB did not open its configured port within 30 seconds. Inspect its private error log.",
      );
    await setTimeout(250);
  }
  console.log(
    "Dedicated MariaDB port is ready. Run db:migrate to verify database authentication and schema.",
  );
} else throw new Error("Use the dedicated MariaDB service for your platform.");

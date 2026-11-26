import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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
  console.log(
    "Dedicated MariaDB start requested. Check readiness before starting the application.",
  );
} else throw new Error("Use the dedicated MariaDB service for your platform.");

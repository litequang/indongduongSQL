import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const file = ".env";
const content = existsSync(file)
  ? readFileSync(file, "utf8")
  : readFileSync(".env.example", "utf8");
if (/^SETUP_SECRET=.+$/m.test(content))
  throw new Error(
    "SETUP_SECRET is already configured; refusing to overwrite it.",
  );
writeFileSync(
  file,
  content.replace(
    /^SETUP_SECRET=.*$/m,
    `SETUP_SECRET=${randomBytes(32).toString("hex")}`,
  ),
  { mode: 0o600 },
);
console.log(
  "One-time setup secret written to ignored .env. Read it privately and enter it on first-run setup.",
);

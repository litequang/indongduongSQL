import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  unlink,
  rm,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { digest, type ObjectStore } from "../server/storage/objects";
export async function objectFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "idd-browser-objects-"));
  const file = (key: string, backup = false) =>
    path.join(root, backup ? "backup" : "primary", key);
  const store: ObjectStore = {
    backupEnabled: true,
    async get(key, backup = false) {
      try {
        return await readFile(file(key, backup));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
    async put(key, data, _mime, backup = false) {
      const f = file(key, backup);
      await mkdir(path.dirname(f), { recursive: true });
      try {
        await writeFile(f, data, { flag: "wx" });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        const current = await this.get(key, backup);
        if (!current || digest(current) !== digest(data))
          throw new Error("Object conflict");
      }
    },
    async delete(key) {
      await unlink(file(key)).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
    },
  };
  return { store, cleanup: () => rm(root, { recursive: true, force: true }) };
}

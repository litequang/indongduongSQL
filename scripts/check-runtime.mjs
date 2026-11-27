import { readFile, readdir, access } from "node:fs/promises";
import assert from "node:assert/strict";
assert(
  !(await access("legacy/firebase").then(
    () => true,
    () => false,
  )),
  "Retired Firebase reference must stay out of the current tree.",
);
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
assert(
  !Object.keys(lock.packages).some((p) =>
    /(?:^|node_modules\/)(?:@firebase\/|firebase(?:-admin|-functions)?(?:\/|$))/.test(
      p,
    ),
  ),
  "Firebase dependency in lockfile.",
);
async function checkSources(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await checkSources(file);
    else if (/\.[cm]?[jt]sx?$/.test(file))
      assert(
        !/(?:from\s*|import\s*\(|require\s*\()\s*["'][^"']*(?:firebase|legacy\/)|workshop_data\.json/.test(
          await readFile(file, "utf8"),
        ),
        `Non-SQL source import: ${file}`,
      );
  }
}
for (const root of ["src", "server", "shared"]) await checkSources(root);
const files = (await readdir("dist/assets"))
  .filter((name) => name.endsWith(".js"))
  .map((name) => `dist/assets/${name}`);
files.push("build/server.cjs");
assert(
  !(await readdir("dist")).some(
    (name) => name.endsWith(".cjs") || name.endsWith(".map"),
  ),
  "Backend artifacts must never be placed in the public static root.",
);
for (const file of files) {
  const source = await readFile(file, "utf8");
  assert(
    !/firebaseapp\.com|firebasestorage\.app|firestore\.googleapis|workshop_data\.json|getFirebaseDb|GoogleGenAI/.test(
      source,
    ),
    `Legacy runtime found: ${file}`,
  );
}
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
assert(!packageJson.dependencies.firebase);
assert(!packageJson.dependencies["firebase-admin"]);
const sw = await readFile("dist/sw.js", "utf8");
assert(sw.includes("NetworkOnly"));
assert(sw.includes("api"));
assert(
  (await readFile("dist/manifest.webmanifest", "utf8")).includes("standalone"),
);
console.log(
  "PASS SQL build graph / legacy-store exclusion / PWA network-only API contract.",
);

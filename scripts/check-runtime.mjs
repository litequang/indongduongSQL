import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
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

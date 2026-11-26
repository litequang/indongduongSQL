import { build } from "esbuild";
await build({
  entryPoints: ["server.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  packages: "external",
  outfile: "build/server.cjs",
  sourcemap: false,
});

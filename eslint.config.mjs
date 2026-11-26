import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
export default tseslint.config(
  {
    ignores: [
      "legacy/**",
      "dist/**",
      "build/**",
      "node_modules/**",
      "public/**",
      "test-results/**",
      "playwright-report/**",
      ".local/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["app.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);

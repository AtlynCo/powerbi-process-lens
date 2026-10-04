import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import powerbiVisuals from "eslint-plugin-powerbi-visuals";
import globals from "globals";

export default tseslint.config(
  { ignores: ["node_modules/**", ".tmp/**", "dist/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  { ...powerbiVisuals.configs.recommended, files: ["src/**/*.ts"] },
  { files: ["scripts/**/*.mjs", "samples/**/*.mjs"], languageOptions: { globals: globals.node } },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error"
    }
  }
);

import js from "@eslint/js";
import tseslint from "typescript-eslint";

// ESLint 9 flat config using typescript-eslint directly. (eslint-config-next's
// legacy config is incompatible with ESLint 9 flat-compat validation, so we lint
// with the well-supported typescript-eslint rules instead; Next-specific checks
// are covered by `next build`'s type and RSC checks.)
export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "extension/**",
      "prisma/migrations/**",
      "tests/stubs/**",
      "*.config.mjs",
      "*.config.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // We use `!` deliberately where the layout/middleware guarantees a value.
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);

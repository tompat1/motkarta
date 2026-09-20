import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

const sonarBugRules = {
  "sonarjs/no-all-duplicated-branches": "error",
  "sonarjs/no-element-overwrite": "error",
  "sonarjs/no-identical-conditions": "error",
  "sonarjs/no-identical-expressions": "error",
  "sonarjs/no-use-of-empty-return-value": "error",
  "sonarjs/no-gratuitous-expressions": "error",
  "sonarjs/no-inverted-boolean-check": "error",
  "sonarjs/no-redundant-boolean": "error",
  "sonarjs/no-redundant-jump": "error",
  "sonarjs/no-same-line-conditional": "error",
  "sonarjs/no-unused-collection": "error",
  "sonarjs/no-useless-catch": "error",
  "sonarjs/prefer-immediate-return": "error",
  "sonarjs/prefer-single-boolean-return": "error",
  "sonarjs/no-duplicated-branches": "error",
  "sonarjs/no-identical-functions": "error",
  "sonarjs/no-collection-size-mischeck": "error",
  "sonarjs/no-empty-collection": "error",
  "sonarjs/no-hardcoded-passwords": "error",
  "sonarjs/insecure-cookie": "error",
  "sonarjs/code-eval": "error",
};

export default tseslint.config(
  {
    ignores: [
      ".venv/**",
      ".tmp/**",
      "dist/**",
      "node_modules/**",
      "public/data/**",
      "build/**",
      ".wrangler/**",
      "outputs/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      "examples/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      sonarjs,
      "react-hooks": reactHooks,
    },
    rules: {
      ...sonarBugRules,
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-escape": "warn",
      "no-constant-condition": ["error", { checkLoops: false }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "sonarjs/prefer-immediate-return": "warn",
      "sonarjs/prefer-single-boolean-return": "warn",
      "sonarjs/no-identical-functions": "warn",
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: [
      "lib/**/*.ts",
      "functions/**/*.ts",
      "db/**/*.ts",
      "scripts/**/*.{js,mjs,cjs,ts}",
      "execution/**/*.{js,mjs,cjs,ts}",
      "tests/**/*.{js,mjs,cjs,ts}",
      "tests_e2e/**/*.{js,mjs,cjs,ts}",
      "vite.config.ts",
      "eslint.config.mjs",
      "workers/**/*.{js,mjs,cjs,ts}",
    ],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.worker },
    },
  },
);

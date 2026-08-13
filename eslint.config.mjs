import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  globalIgnores([
    "dist/**",
    "node_modules/**",
    ".wrangler/**",
    "examples/**",
    "build/**",
  ]),
]);

export default eslintConfig;

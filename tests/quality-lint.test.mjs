import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("lint script runs ESLint and Ruff instead of typecheck", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.scripts.lint, "node scripts/run-lint.mjs");
  assert.match(pkg.scripts["test:gate"], /npm run lint/);
  const runner = readFileSync(join(root, "scripts/run-lint.mjs"), "utf8");
  assert.match(runner, /eslint/);
  assert.match(runner, /ruff/);
});

test("quality configs ignore catalog data and keep Sourcery rule categories", () => {
  const eslint = readFileSync(join(root, "eslint.config.mjs"), "utf8");
  assert.match(eslint, /public\/data/);
  assert.match(eslint, /sonarjs/);
  const ruff = readFileSync(join(root, "pyproject.toml"), "utf8");
  assert.match(ruff, /select = \["E", "F", "B", "S", "SIM", "UP", "PERF", "C90"\]/);
  assert.match(ruff, /"public"/);
});

test("GitHub workflows no longer call Sourcery", () => {
  const workflowDir = join(root, ".github/workflows");
  const files = readdirSync(workflowDir).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));
  assert.ok(files.includes("quality.yml"));
  assert.ok(!files.includes("sourcery.yml"));
  const combined = files.map((name) => readFileSync(join(workflowDir, name), "utf8")).join("\n");
  assert.doesNotMatch(combined, /sourcery-ai\/sourcery-action/);
  assert.doesNotMatch(combined, /SOURCERY_TOKEN/);
  assert.match(combined, /npm run lint/);
});

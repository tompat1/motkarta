import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function runRequired(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status) process.exit(result.status);
}

function canRun(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return !result.error && result.status === 0;
}

runRequired("npx", ["eslint", "."]);

if (existsSync(".venv/bin/ruff")) {
  runRequired(".venv/bin/ruff", ["check", "."]);
} else if (canRun("python3", ["-m", "ruff", "--version"])) {
  runRequired("python3", ["-m", "ruff", "check", "."]);
} else if (canRun("ruff", ["--version"])) {
  runRequired("ruff", ["check", "."]);
} else {
  console.error("Ruff is not installed. Create .venv and run: pip install -r requirements-python.txt");
  process.exit(1);
}

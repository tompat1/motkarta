type RuntimeEnv = {
  ALLOW_DEMO_FALLBACK?: unknown;
  MOTKARTA_DEMO_MODE?: unknown;
};

function isTruthyFlag(value: unknown) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());
}

export function demoFallbackEnabled(env: RuntimeEnv = {}) {
  return isTruthyFlag(env.ALLOW_DEMO_FALLBACK) || isTruthyFlag(env.MOTKARTA_DEMO_MODE);
}

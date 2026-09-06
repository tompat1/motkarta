import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const files = readdirSync('tests').filter((name) => name.endsWith('.test.mjs')).sort().map((name) => `tests/${name}`);
const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], {
  stdio: 'inherit',
  // Node 22.13–22.17 needs this flag; CLI generator subprocesses need it too.
  env: { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, '--experimental-strip-types'].filter(Boolean).join(' ') },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

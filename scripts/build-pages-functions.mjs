import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { copyFileSync, readdirSync, rmSync } from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const wrangler = path.join(path.dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js');
const output = path.join(root, '.tmp/pages-functions-build');
rmSync(output, { recursive: true, force: true });

// Pages' automatic Functions builder may use an older parser than our lockfile.
// Ship the complete compiled server, including admin/auth routes, in advanced mode.
execFileSync(process.execPath, [wrangler, 'pages', 'functions', 'build', 'functions',
  '--outdir', output, '--output-routes-path', 'dist/_routes.json',
  '--build-output-directory', 'dist', '--minify'], {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH ?? path.join(root, '.tmp/wrangler-logs') },
});
// --outfile emits a multipart upload payload in Wrangler 4, not executable JS.
// Our server currently bundles to one module. Fail rather than lose new assets.
if (JSON.stringify(readdirSync(output).sort()) !== JSON.stringify(['index.js'])) {
  throw new Error('Unexpected server modules: update Pages packaging before deployment');
}
copyFileSync(path.join(output, 'index.js'), path.join(root, 'dist/_worker.js'));

import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Local preparation only. Deployment is a separate, explicit Wrangler command.
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, '.tmp/concierge-preview');
const site = path.join(destination, 'site');
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('wrangler/package.json'))('esbuild');
await mkdir(destination, { recursive: true });
await rm(site, { recursive: true, force: true });
await cp(path.join(root, 'dist'), site, { recursive: true });
await build({ entryPoints: [path.join(root, 'execution/concierge-preview-worker.ts')], outfile: path.join(site, '_worker.js'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true });
await writeFile(path.join(site, '_routes.json'), JSON.stringify({ version: 1, include: ['/*'], exclude: [] }));
const config = await readFile(path.join(root, 'wrangler.toml'), 'utf8');
// Stop on configuration drift; review any new binding before a preview uses it.
const sections = [...config.matchAll(/^\s*\[+([^\]]+)\]+/gm)].map((match) => match[1]);
if (sections.some((section) => !['d1_databases', 'vars'].includes(section)) || /\b(AI|CONCIERGE_INDEX|CONCIERGE_RATE_LIMITER)\b/.test(config)) throw new Error('Review new bindings before preparing a lexical preview');
const dbId = config.match(/database_id\s*=\s*"([\w-]+)"/)?.[1];
const date = config.match(/compatibility_date\s*=\s*"([\d-]+)"/)?.[1];
if (!dbId || !date) throw new Error('Missing catalog binding or compatibility date');
await writeFile(path.join(destination, 'wrangler.toml'), `name = "motkarta"\npages_build_output_dir = "site"\ncompatibility_date = "${date}"\n\n[limits]\ncpu_ms = 1000\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "motkarta-prod"\ndatabase_id = "${dbId}"\n\n[vars]\nCONCIERGE_RETRIEVAL_MODE = "lexical"\nCONCIERGE_SYNTHESIS_MODE = "template"\n`);
const hash = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const manifest = {
  version: 'concierge-preview-v1', preparedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
  branch: 'concierge-rag-preview', databaseId: dbId, databaseAccess: 'three_catalog_selects_only',
  retrieval: 'lexical', synthesis: 'template', paidInference: false, cpuLimitMs: 1000,
  workerSha256: await hash(path.join(site, '_worker.js')), publicCatalogSha256: await hash(path.join(site, 'data/places.json')),
};
await writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));

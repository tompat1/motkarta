import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Local preparation only. Deployment and paid smoke requests are separate explicit commands.
const hybrid = process.argv.includes('--hybrid');
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, '.tmp/concierge-ai-preview');
const site = path.join(destination, 'dist');
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('wrangler/package.json'))('esbuild');
await mkdir(destination, { recursive: true });
await rm(site, { recursive: true, force: true });
await cp(path.join(root, 'dist'), site, { recursive: true });
await build({ entryPoints: [path.join(root, 'execution/concierge-ai-preview-worker.ts')], outfile: path.join(site, '_worker.js'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true });
await writeFile(path.join(site, '_routes.json'), JSON.stringify({ version: 1, include: ['/*'], exclude: [] }));
const config = await readFile(path.join(root, 'wrangler.toml'), 'utf8');
const dbId = config.match(/database_id\s*=\s*"([\w-]+)"/)?.[1];
const date = config.match(/compatibility_date\s*=\s*"([\d-]+)"/)?.[1];
if (!dbId || !date) throw new Error('Missing catalog binding or compatibility date');

const previewBranch = hybrid ? 'concierge-ai-hybrid-preview' : 'concierge-ai-preview';
const previewHostname = hybrid ? 'concierge-ai-hybrid-preview.motkarta.pages.dev' : 'concierge-ai-preview.motkarta.pages.dev';
const previewConfigLines = [
  'name = "motkarta"',
  'pages_build_output_dir = "dist"',
  `compatibility_date = "${date}"`,
  '',
  '[limits]',
  'cpu_ms = 10000',
  '',
  '[[d1_databases]]',
  'binding = "DB"',
  'database_name = "motkarta-prod"',
  `database_id = "${dbId}"`,
  '',
  '[ai]',
  'binding = "AI"',
  '',
];
if (hybrid) {
  previewConfigLines.push(
    '[[vectorize]]',
    'binding = "CONCIERGE_INDEX"',
    'index_name = "motkarta-concierge-preview-v1"',
    '',
  );
}
previewConfigLines.push(
  '[[services]]',
  'binding = "CONCIERGE_RATE_GATE"',
  'service = "motkarta-concierge-ai-gate"',
  '',
  '[vars]',
  `CONCIERGE_RETRIEVAL_MODE = "${hybrid ? 'hybrid' : 'lexical'}"`,
  'CONCIERGE_SYNTHESIS_MODE = "constrained"',
  'CONCIERGE_DEADLINE_MS = "8000"',
);
if (hybrid) {
  // Diagnostic preview threshold from the 2026-09-07 trial sweep; not a production default.
  previewConfigLines.push('CONCIERGE_MIN_SIMILARITY = "0.5"');
}
previewConfigLines.push('');
await writeFile(path.join(destination, 'wrangler.toml'), previewConfigLines.join('\n'));

const hash = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const manifest = {
  version: hybrid ? 'concierge-ai-hybrid-preview-v1' : 'concierge-ai-preview-v1',
  preparedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
  branch: previewBranch,
  previewHostname,
  databaseId: dbId,
  databaseAccess: 'three_catalog_selects_only',
  retrieval: hybrid ? 'hybrid' : 'lexical',
  synthesis: 'constrained',
  embeddingModel: hybrid ? '@cf/baai/bge-m3' : undefined,
  vectorIndex: hybrid ? 'motkarta-concierge-preview-v1' : undefined,
  minSimilarity: hybrid ? 0.5 : undefined,
  model: '@cf/google/gemma-4-26b-a4b-it',
  paidInference: true,
  rateGateService: 'motkarta-concierge-ai-gate',
  dailyAiUnitLimit: 200,
  cpuLimitMs: 10000,
  deadlineMs: 8000,
  workerSha256: await hash(path.join(site, '_worker.js')),
  publicCatalogSha256: await hash(path.join(site, 'data/places.json')),
};
await writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));

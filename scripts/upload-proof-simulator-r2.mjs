#!/usr/bin/env node

import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const managedDir = join(rootDir, 'contracts', 'managed', 'proofSimulator');
const wranglerBin = join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');

function usage() {
  console.log(`Usage: npm run upload:proof-simulator:r2 -- --bucket <name> [options]

Options:
  --bucket <name>         R2 bucket (or PROOF_SIMULATOR_R2_BUCKET)
  --prefix <path>         Object prefix (default: proofSimulator)
  --create-bucket         Create the bucket before uploading
  --apply-cors            Apply cloudflare/proof-simulator-r2-cors.json
  --domain <hostname>     Connect an R2 custom domain after uploading
  --zone-id <id>          Cloudflare zone ID required with --domain
  --enable-dev-url        Enable the rate-limited r2.dev URL (testing only)
  --dry-run               Print the upload plan without changing Cloudflare
`);
}

const options = {
  bucket: process.env.PROOF_SIMULATOR_R2_BUCKET,
  prefix: process.env.PROOF_SIMULATOR_R2_PREFIX ?? 'proofSimulator',
  createBucket: false,
  applyCors: false,
  domain: undefined,
  zoneId: undefined,
  enableDevUrl: false,
  dryRun: false,
};

for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  const nextValue = () => {
    const value = process.argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
    return value;
  };

  if (argument === '--bucket') options.bucket = nextValue();
  else if (argument === '--prefix') options.prefix = nextValue();
  else if (argument === '--domain') options.domain = nextValue();
  else if (argument === '--zone-id') options.zoneId = nextValue();
  else if (argument === '--create-bucket') options.createBucket = true;
  else if (argument === '--apply-cors') options.applyCors = true;
  else if (argument === '--enable-dev-url') options.enableDevUrl = true;
  else if (argument === '--dry-run') options.dryRun = true;
  else if (argument === '--help' || argument === '-h') {
    usage();
    process.exit(0);
  } else throw new Error(`Unknown argument: ${argument}`);
}

if (!options.bucket) {
  usage();
  throw new Error('An R2 bucket is required. Pass --bucket or set PROOF_SIMULATOR_R2_BUCKET.');
}
if (options.domain && !options.zoneId) throw new Error('--zone-id is required with --domain.');
if (options.zoneId && !options.domain) throw new Error('--domain is required with --zone-id.');

const prefix = options.prefix.replace(/^\/+|\/+$/g, '');
const manifestPath = join(managedDir, 'proof-simulator-manifest.json');
const manifest = JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(manifestPath, 'utf8')));
if (!manifest.complete) throw new Error('The proof simulator manifest is incomplete. Generate full proving keys first.');

function collectFiles(directory, predicate) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(path, predicate);
    return predicate(path) ? [path] : [];
  });
}

const files = [
  { source: manifestPath, key: 'manifest.json', contentType: 'application/json', cacheControl: 'no-cache' },
  ...collectFiles(join(managedDir, 'keys'), () => true).map((source) => ({
    source,
    key: relative(managedDir, source).split(sep).join('/'),
    contentType: 'application/octet-stream',
    cacheControl: 'public, max-age=31536000, immutable',
  })),
  ...collectFiles(join(managedDir, 'zkir'), (path) => path.endsWith('.bzkir')).map((source) => ({
    source,
    key: relative(managedDir, source).split(sep).join('/'),
    contentType: 'application/octet-stream',
    cacheControl: 'public, max-age=31536000, immutable',
  })),
];

function runWrangler(args) {
  console.log(`wrangler ${args.join(' ')}`);
  if (options.dryRun) return;
  const result = spawnSync(wranglerBin, args, { cwd: rootDir, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (options.createBucket) runWrangler(['r2', 'bucket', 'create', options.bucket]);
if (options.applyCors) {
  runWrangler([
    'r2', 'bucket', 'cors', 'set', options.bucket,
    '--file', join(rootDir, 'cloudflare', 'proof-simulator-r2-cors.json'), '--force',
  ]);
}

const totalBytes = files.reduce((sum, file) => sum + statSync(file.source).size, 0);
console.log(`Uploading ${files.length} files (${(totalBytes / 1024 / 1024).toFixed(1)} MiB) to r2://${options.bucket}/${prefix}/`);
for (const file of files) {
  const objectKey = prefix ? `${prefix}/${file.key}` : file.key;
  runWrangler([
    'r2', 'object', 'put', `${options.bucket}/${objectKey}`,
    '--remote', '--file', file.source, '--content-type', file.contentType,
    '--cache-control', file.cacheControl, '--force',
  ]);
}

if (options.domain) {
  runWrangler([
    'r2', 'bucket', 'domain', 'add', options.bucket,
    '--domain', options.domain, '--zone-id', options.zoneId, '--min-tls', '1.2', '--force',
  ]);
}
if (options.enableDevUrl) {
  runWrangler(['r2', 'bucket', 'dev-url', 'enable', options.bucket, '--force']);
}

console.log('Upload complete.');
console.log(`Set VITE_ZK_PROOF_SIMULATOR_ASSET_BASE_PATH=https://<R2-domain>/${prefix}`);

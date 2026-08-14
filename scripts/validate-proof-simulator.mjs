#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = join(root, 'contracts/managed/proofSimulator');
const manifestPath = join(artifactRoot, 'proof-simulator-manifest.json');

function fail(message) {
  throw new Error(`Proof simulator validation failed: ${message}`);
}

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

if (!existsSync(manifestPath)) fail('manifest is missing');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!manifest.complete) fail('manifest is marked incomplete');
if (!Array.isArray(manifest.circuits) || manifest.circuits.length === 0) fail('manifest has no circuits');

const seenIds = new Set();
const seenK = new Set();
for (const circuit of manifest.circuits) {
  if (seenIds.has(circuit.circuitId)) fail(`duplicate circuit id ${circuit.circuitId}`);
  if (seenK.has(circuit.actualK)) fail(`duplicate k=${circuit.actualK}`);
  seenIds.add(circuit.circuitId);
  seenK.add(circuit.actualK);
  if (circuit.targetK !== circuit.actualK) fail(`${circuit.circuitId} target/actual k mismatch`);
  if (circuit.actualK < 6 || circuit.actualK > 25) fail(`${circuit.circuitId} is out of range`);

  const paths = {
    prover: join(artifactRoot, 'keys', `${circuit.circuitId}.prover`),
    verifier: join(artifactRoot, 'keys', `${circuit.circuitId}.verifier`),
    zkir: join(artifactRoot, 'zkir', `${circuit.circuitId}.bzkir`),
  };
  for (const [kind, path] of Object.entries(paths)) {
    if (!existsSync(path)) fail(`${circuit.circuitId} ${kind} artifact is missing`);
    if (statSync(path).size !== circuit.artifacts?.[kind]?.bytes) fail(`${circuit.circuitId} ${kind} size mismatch`);
    if (digest(path) !== circuit.artifacts?.[kind]?.sha256) fail(`${circuit.circuitId} ${kind} hash mismatch`);
  }
}

for (let k = manifest.minK; k <= manifest.maxK; k += 1) {
  if (!seenK.has(k)) fail(`missing k=${k}`);
}

console.log(`Validated ${manifest.circuits.length} proof simulator circuits (k=${manifest.minK}…${manifest.maxK}).`);

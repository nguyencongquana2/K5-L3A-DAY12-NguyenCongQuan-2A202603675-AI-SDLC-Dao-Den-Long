import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const gameRoot = resolve(import.meta.dirname, '..');
const scenario = resolve(gameRoot, 'tests/fixtures/determinism-scenario.json');
const inputs = resolve(gameRoot, 'tests/fixtures/determinism-inputs.json');
const outputA = resolve(gameRoot, 'docs/proof/phase-1/determinism-a.jsonl');
const outputB = resolve(gameRoot, 'docs/proof/phase-1/determinism-b.jsonl');

function run(output) {
  const result = spawnSync(process.execPath, [
    'src/headless/cli.js',
    '--seed', '2026',
    '--night', '1',
    '--scenario', scenario,
    '--inputs', inputs,
    '--ticks', '120',
    '--snapshot-every', '10',
    '--out', output,
  ], { cwd: gameRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

run(outputA);
run(outputB);
const [first, second] = await Promise.all([readFile(outputA), readFile(outputB)]);
assert.deepEqual(first, second, 'same seed/scenario/inputs must produce byte-identical output');
console.log(`Determinism verified: ${first.length} identical bytes across two runs.`);

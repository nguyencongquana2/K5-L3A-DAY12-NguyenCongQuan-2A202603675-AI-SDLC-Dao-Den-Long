import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const gameRoot = resolve(import.meta.dirname, '..');
const scenario = resolve(gameRoot, 'tests/fixtures/determinism-scenario.json');
const inputs = resolve(gameRoot, 'tests/fixtures/determinism-inputs.json');
const directory = await mkdtemp(resolve(tmpdir(), 'dao-den-long-determinism-'));
const outputA = resolve(directory, 'determinism-a.jsonl');
const outputB = resolve(directory, 'determinism-b.jsonl');

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

try {
  run(outputA);
  run(outputB);
  const [first, second] = await Promise.all([readFile(outputA), readFile(outputB)]);
  assert.deepEqual(first, second, 'same seed/scenario/inputs must produce byte-identical output');
  console.log(`Determinism verified: ${first.length} identical bytes across two runs.`);
} finally {
  await rm(directory, { recursive: true, force: true });
}

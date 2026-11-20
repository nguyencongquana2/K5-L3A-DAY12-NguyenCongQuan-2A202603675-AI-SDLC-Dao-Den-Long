import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../src/headless/cli.js';

const gameRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const directory = await mkdtemp(resolve(tmpdir(), 'dao-den-long-phase2-'));
const scenario = resolve(gameRoot, 'tests/fixtures/phase2-performance-scenario.json');
const first = resolve(directory, 'first.jsonl');
const second = resolve(directory, 'second.jsonl');
const args = (out) => [
  '--seed', '2026', '--night', '3', '--scenario', scenario,
  '--ticks', '21600', '--snapshot-every', '3600', '--out', out,
];

try {
  const started = performance.now();
  await run(args(first));
  const elapsedS = (performance.now() - started) / 1000;
  assert.ok(elapsedS <= 30, `21,600 ticks took ${elapsedS.toFixed(3)}s, exceeding 30s`);
  await run(args(second));
  const [a, b] = await Promise.all([readFile(first), readFile(second)]);
  assert.deepEqual(a, b, 'Phase 2 full-Night output is not byte-identical');
  console.log(`Phase 2 performance verified: 21,600 ticks in ${elapsedS.toFixed(3)}s; ${a.length} deterministic bytes.`);
} finally {
  await rm(directory, { recursive: true, force: true });
}

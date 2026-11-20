import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// Integration tests execute the public CLI, not private implementation hooks.
const root = resolve(import.meta.dirname, '..');

function execute(args) {
  return spawnSync(process.execPath, ['src/headless/cli.js', ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('CLI writes snapshot tick 0 and a mandatory final end record', async (context) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'dao-den-long-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const output = resolve(directory, 'result.jsonl');
  const result = execute([
    '--seed', '7', '--night', '1', '--ticks', '2', '--snapshot-every', '1', '--out', output,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const records = (await readFile(output, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(records[0].type, 'snapshot');
  assert.equal(records[0].tick, 0);
  assert.deepEqual(records.at(-1), { type: 'end', ticks: 2, state: 'playing', score: 0 });
});

test('malformed scenario and input files exit with contract code 2', async (context) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'dao-den-long-invalid-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const malformed = resolve(directory, 'bad.json');
  const badSchema = resolve(directory, 'bad-inputs.json');
  await writeFile(malformed, '{oops', 'utf8');
  await writeFile(badSchema, JSON.stringify({ frames: [{ tick: 0, pulse: 'yes' }] }), 'utf8');

  const badScenarioResult = execute([
    '--seed', '1', '--night', '1', '--scenario', malformed, '--ticks', '1', '--out', resolve(directory, 'a.jsonl'),
  ]);
  assert.equal(badScenarioResult.status, 2);
  assert.match(badScenarioResult.stderr, /invalid scenario file/);

  const badInputsResult = execute([
    '--seed', '1', '--night', '1', '--inputs', badSchema, '--ticks', '1', '--out', resolve(directory, 'b.jsonl'),
  ]);
  assert.equal(badInputsResult.status, 2);
  assert.match(badInputsResult.stderr, /must be boolean/);
});

test('scenario construction emits no events and does not award score', async (context) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'dao-den-long-scenario-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const scenario = resolve(directory, 'scenario.json');
  const output = resolve(directory, 'result.jsonl');
  await writeFile(scenario, JSON.stringify({
    random_motes: false,
    random_shades: false,
    lanterns: [{ id: 'L1', lit: true }]
  }), 'utf8');
  const result = execute([
    '--seed', '1', '--night', '1', '--scenario', scenario, '--ticks', '0', '--out', output,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const records = (await readFile(output, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(records[0].score, 0);
  assert.equal(records[0].lanterns[0].lit, true);
  assert.equal(records.some((record) => record.type === 'event'), false);
});

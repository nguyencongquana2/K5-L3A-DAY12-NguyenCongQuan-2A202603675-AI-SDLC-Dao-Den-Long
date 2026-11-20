import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { Simulation } from '../src/core/simulation.js';
import { addLeaderboardEntry, normalizeLeaderboard } from '../src/core/leaderboard.js';
import { run as runLauncher } from '../src/launcher/cli.js';

const contract = JSON.parse(await readFile(new URL('../../game.contract.json', import.meta.url), 'utf8'));
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const web = await readFile(new URL('../src/web/main.js', import.meta.url), 'utf8');
const bench = await readFile(new URL('../src/bench/cli.js', import.meta.url), 'utf8');
const soak = await readFile(new URL('../src/soak/cli.js', import.meta.url), 'utf8');

test('contract v1.3 publishes benchmark and soak commands', () => {
  assert.equal(contract.contract_version, '1.3');
  assert.match(contract.bench_cmd, /bench\/cli\.js/);
  assert.match(contract.soak_cmd, /soak\/cli\.js/);
  assert.match(contract.run_cmd, /launcher\/cli\.js/);
});

test('benchmark mode keeps its standardized scene isolated from gameplay side effects', () => {
  const simulation = new Simulation({
    seed: 42,
    tuning: contract.tuning,
    contractVersion: '1.3',
    night: 1,
    mode: 'benchmark',
    scenario: {
      player: { pos: [0, 0, 0], flames: 3 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      charms: [],
      motes: [[0, 0, 0]],
      lanterns: [{ id: 'L1', lit: true, fuel: 100, ever_lit: true }],
      shades: [{ id: 'S1', pos: [10, 0, 0], state: 'wander' }],
    },
  });
  const shadeStart = [...simulation.shades[0].pos];
  for (let tick = 0; tick < 600; tick += 1) simulation.step({ interact: true, pulse: true });
  assert.equal(simulation.state, 'playing');
  assert.equal(simulation.player.flames, 3);
  assert.equal(simulation.player.carried, 0);
  assert.deepEqual(simulation.player.pos, [0, 0, 0]);
  assert.equal(simulation.motes.length, 1);
  assert.equal(simulation.lanterns[0].fuel, 100);
  assert.notDeepEqual(simulation.shades[0].pos, shadeStart);
});

test('leaderboard validates names, sorts score and time, and keeps only top ten', () => {
  const entries = Array.from({ length: 12 }, (_, index) => ({
    name: `MAY_${String(index).padStart(2, '0')}`,
    score: index < 2 ? 500 : index * 10,
    nights_won: index % 4,
    achieved_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    seed: 2026,
  }));
  const normalized = normalizeLeaderboard(entries);
  assert.equal(normalized.length, 10);
  assert.equal(normalized[0].name, 'MAY_00');
  assert.equal(normalized[1].name, 'MAY_01');
  assert.throws(() => addLeaderboardEntry([], { ...entries[0], name: 'x!' }), /invalid/);
});

test('launcher exports a correctly shaped local leaderboard document', async (context) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'dao-den-long-export-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const output = resolve(directory, 'leaderboard.json');
  await runLauncher(['--export-leaderboard', output]);
  const document = JSON.parse(await readFile(output, 'utf8'));
  assert.ok(Array.isArray(document.entries));
  assert.deepEqual(document.entries, normalizeLeaderboard(document.entries));
});

test('web shell exposes every required accessibility and leaderboard control', () => {
  for (const id of [
    'leaderboard', 'leaderboard-entry', 'key-bindings', 'restore-bindings', 'reduced-motion',
    'large-text', 'shade-arrow', 'wind-warning', 'fuel-warning',
  ]) assert.match(html, new RegExp(`id="${id}"`));
  for (const action of ['moveForward', 'moveBackward', 'moveLeft', 'moveRight', 'jump', 'dash', 'interact', 'pulse', 'pause']) {
    assert.match(web, new RegExp(`${action}:`));
  }
  assert.match(web, /conflict/);
  assert.match(web, /localStorage/);
  assert.match(web, /new Date\(\)\.toISOString\(\)/);
});

test('benchmark and soak CLIs encode the standardized measurement formulas and probabilities', () => {
  assert.match(web, /benchmarkPoints\(200/);
  assert.match(web, /benchmarkPoints\(100/);
  assert.match(web, /Math\.cos\(angle\) \* 30, 15, Math\.sin\(angle\) \* 30/);
  assert.match(bench, /p1_low_fps/);
  assert.match(bench, /frame_ms_p95/);
  assert.match(bench, /peak_mem_mb: null/);
  for (const probability of ['0.05', '0.03', '0.02', '0.1']) assert.match(soak, new RegExp(`< ${probability.replace('.', '\\.')}[,)]`));
});

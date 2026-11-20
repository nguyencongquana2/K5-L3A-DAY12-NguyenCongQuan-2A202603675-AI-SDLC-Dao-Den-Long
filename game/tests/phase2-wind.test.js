import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Simulation } from '../src/core/simulation.js';

const contract = JSON.parse(await readFile(new URL('../../game.contract.json', import.meta.url), 'utf8'));
const tuning = {
  ...structuredClone(contract.tuning),
  dash_speed: 14,
  dash_duration_s: 12 / 60,
  dash_cooldown_s: 1,
};

function makeWindSimulation(windEnabled = true) {
  return new Simulation({
    seed: 81,
    tuning,
    contractVersion: '1.1',
    night: 3,
    scenario: {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      charms: [],
      wind_enabled: windEnabled,
    },
  });
}

test('Night 3 wind warns for 2 seconds then pushes at 2 m/s for 5 seconds', () => {
  const simulation = makeWindSimulation();
  for (let tick = 0; tick < 1680; tick += 1) simulation.step({});
  assert.equal(simulation.wind.warning, false);
  assert.equal(simulation.wind.active, false);

  simulation.step({});
  assert.equal(simulation.wind.warning, true);
  assert.equal(simulation.wind.active, false);
  const direction = simulation.wind.dirDeg;

  for (let tick = 1; tick < 120; tick += 1) simulation.step({});
  assert.equal(simulation.simTick, 1800);
  const before = [...simulation.player.pos];
  simulation.step({});
  assert.equal(simulation.wind.active, true);
  assert.equal(simulation.wind.dirDeg, direction);
  assert.ok(Math.abs(Math.hypot(
    simulation.player.pos[0] - before[0],
    simulation.player.pos[2] - before[2]
  ) - 2 / 60) < 1e-10);

  for (let tick = 1; tick < 300; tick += 1) simulation.step({});
  assert.equal(simulation.simTick, 2100);
  simulation.step({});
  assert.equal(simulation.wind.active, false);
});

test('wind direction is deterministic for the same seed and pause freezes its schedule', () => {
  const first = makeWindSimulation();
  const second = makeWindSimulation();
  for (let tick = 0; tick <= 1680; tick += 1) {
    first.step({});
    second.step({});
  }
  assert.equal(first.wind.dirDeg, second.wind.dirDeg);

  const simTick = first.simTick;
  first.step({ pause: true });
  first.step({ pause: false });
  assert.equal(first.simTick, simTick);
  assert.equal(first.wind.dirDeg, second.wind.dirDeg);
});

test('wind_enabled false disables warning, activation and force', () => {
  const simulation = makeWindSimulation(false);
  for (let tick = 0; tick < 1900; tick += 1) simulation.step({});
  assert.equal(simulation.wind.warning, false);
  assert.equal(simulation.wind.active, false);
  assert.deepEqual(simulation.player.pos, [0, 0, 0]);
  assert.deepEqual(simulation.snapshot().wind, { active: false, dir_deg: 0 });
});

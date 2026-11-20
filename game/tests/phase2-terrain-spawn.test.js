import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Simulation } from '../src/core/simulation.js';

const contract = JSON.parse(await readFile(new URL('../../game.contract.json', import.meta.url), 'utf8'));

function makeSimulation(night, scenario = {}) {
  return new Simulation({
    seed: 33,
    tuning: contract.tuning,
    contractVersion: '1.1',
    night,
    scenario: {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      charms: [],
      ...scenario,
    },
  });
}

test('Night 2 ground includes both islands and the exact bamboo bridge only', () => {
  const simulation = makeSimulation(2);
  assert.equal(simulation.groundHeightAt(0, 0, 0), 0);
  assert.equal(simulation.groundHeightAt(70, 0, 0), 0);
  assert.equal(simulation.groundHeightAt(35, 0, 0), 0);
  assert.equal(simulation.groundHeightAt(35, 3, 0), null);
  assert.equal(simulation.groundHeightAt(35, 5, 0), null);
});

test('Night 2 launch pad locks the specified vertical and horizontal velocity', () => {
  const simulation = makeSimulation(2, { player: { pos: [20, 0, 18] } });
  simulation.step({ move: [-1, 0] });
  assert.equal(simulation.player.launchLocked, true);
  assert.ok(simulation.player.velocityY > 13.6 && simulation.player.velocityY < 14);
  assert.ok(Math.abs(Math.hypot(...simulation.player.launchVelocity) - 24) < 1e-10);
});

test('falling below the island costs a flame, loses carried motes and respawns', () => {
  const simulation = makeSimulation(2, { player: { pos: [35, -9, 8], carried: 7, flames: 3 } });
  const events = simulation.step({});
  assert.deepEqual(events[0], {
    name: 'player_hit',
    data: { by: 'fall', flames: 2, dropped: 0, lost: 7 },
  });
  assert.deepEqual(simulation.player.pos, [0, 0, 0]);
  assert.equal(simulation.player.carried, 0);
});

test('Night 3 resolves base, elevated half-annulus, summit and both ramps', () => {
  const simulation = makeSimulation(3);
  assert.equal(simulation.groundHeightAt(34, 0, 0), 0);
  assert.equal(simulation.groundHeightAt(18, 10, 3), 3);
  assert.equal(simulation.groundHeightAt(0, 0, 6), 6);
  const rampRadius = 27;
  const x = Math.cos(Math.PI / 6) * rampRadius;
  const z = Math.sin(Math.PI / 6) * rampRadius;
  assert.ok(Math.abs(simulation.groundHeightAt(x, z, 3) - 1.5) < 1e-10);
});

test('standard shade and drifter schedules spawn at the exact ticks', () => {
  const night1 = makeSimulation(1, { random_shades: true });
  for (let tick = 0; tick < 299; tick += 1) night1.step({});
  assert.equal(night1.shades.length, 0);
  night1.step({});
  assert.equal(night1.shades.length, 2);
  assert.ok(night1.shades.every((shade) => shade.state === 'spawning'));

  const night2 = makeSimulation(2, { random_drifters: true });
  for (let tick = 0; tick < 1199; tick += 1) night2.step({});
  assert.equal(night2.drifters.length, 0);
  night2.step({});
  assert.equal(night2.drifters.length, 1);
  assert.equal(night2.drifters[0].id, 'D1');
});

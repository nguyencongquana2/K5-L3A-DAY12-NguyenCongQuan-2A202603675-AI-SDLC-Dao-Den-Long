import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Simulation } from '../src/core/simulation.js';

const contract = JSON.parse(await readFile(new URL('../../game.contract.json', import.meta.url), 'utf8'));
const tuning = {
  ...structuredClone(contract.tuning),
  dash_speed: 14,
  dash_duration_s: 12 / 60,
  // A fixture value only. The missing standard table must supply the release value.
  dash_cooldown_s: 1,
};

function makeSimulation({ night = 1, player } = {}) {
  return new Simulation({
    seed: 4,
    tuning,
    contractVersion: '1.1',
    night,
    scenario: { player, random_motes: false, random_shades: false },
  });
}

test('dash travels at 14 m/s for exactly 12 ticks and emits one event', () => {
  const simulation = makeSimulation();
  const events = simulation.step({ move: [0, 1], dash: true });
  assert.deepEqual(events[0], { name: 'dash', data: {} });
  assert.equal(simulation.player.dashTicks, 11);

  for (let tick = 1; tick < 12; tick += 1) simulation.step({ move: [1, 0], dash: false });

  assert.equal(simulation.player.dashTicks, 0);
  assert.ok(Math.abs(simulation.player.pos[0]) < 1e-10, 'movement input must not redirect an active dash');
  assert.ok(Math.abs(simulation.player.pos[2] - 14 * 12 / 60) < 1e-10);
  assert.deepEqual(simulation.snapshot().player.vel, [0, 0, 14]);
});

test('a new dash press during an active dash is ignored', () => {
  const simulation = makeSimulation();
  simulation.step({ move: [1, 0], dash: true });
  simulation.step({ dash: false });
  const events = simulation.step({ move: [-1, 0], dash: true });

  assert.equal(events.some((event) => event.name === 'dash'), false);
  assert.deepEqual(simulation.player.dashDirection, [1, 0]);
});

test('dash cooldown is frozen by pause', () => {
  const simulation = makeSimulation();
  simulation.step({ dash: true });
  assert.equal(simulation.player.dashCooldownTicks, 60);
  simulation.step({ dash: false, pause: true });
  simulation.step({ pause: false });
  assert.equal(simulation.player.dashCooldownTicks, 60);
});

test('an active wind charm removes dash cooldown but still requires a new press', () => {
  const simulation = makeSimulation({ night: 2, player: { pos: [35, 0, 0] } });
  simulation.step({});
  simulation.player.pos = [0, 0, 0];

  simulation.step({ dash: true });
  assert.equal(simulation.player.dashCooldownTicks, 0);
  for (let tick = 1; tick < 12; tick += 1) simulation.step({ dash: true });
  assert.equal(simulation.player.dashTicks, 0);

  const held = simulation.step({ dash: true });
  assert.equal(held.some((event) => event.name === 'dash'), false);
  simulation.step({ dash: false });
  const pressedAgain = simulation.step({ dash: true });
  assert.equal(pressedAgain.some((event) => event.name === 'dash'), true);
});

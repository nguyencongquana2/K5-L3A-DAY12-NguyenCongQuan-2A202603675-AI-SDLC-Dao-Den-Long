import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Simulation } from '../src/core/simulation.js';
import { validateInputs } from '../src/headless/inputs.js';

const contract = JSON.parse(await readFile(new URL('../../game.contract.json', import.meta.url), 'utf8'));

function makeSimulation() {
  return new Simulation({
    seed: 22,
    tuning: contract.tuning,
    scenario: { random_motes: false, random_shades: false, time_left_s: 10 },
  });
}

test('pause advances wall tick while freezing simulation time', () => {
  const simulation = makeSimulation();
  simulation.player.invulnTicks = 10;
  simulation.player.pulseCooldownTicks = 20;
  const paused = simulation.step({ move: [0, 1], pause: true });

  assert.deepEqual(paused, [{ name: 'paused', data: {} }]);
  assert.equal(simulation.tick, 1);
  assert.equal(simulation.simTick, 0);
  assert.equal(simulation.timeLeftS, 10);
  assert.equal(simulation.player.invulnTicks, 10);
  assert.equal(simulation.player.pulseCooldownTicks, 20);
  assert.equal(simulation.player.pos[2], 0);
  assert.equal(simulation.snapshot().state, 'paused');

  simulation.step({ move: [0, 1], pause: false });
  assert.equal(simulation.tick, 2);
  assert.equal(simulation.simTick, 0);
  assert.equal(simulation.timeLeftS, 10);
  assert.equal(simulation.player.invulnTicks, 10);
  assert.equal(simulation.player.pulseCooldownTicks, 20);
  assert.equal(simulation.player.pos[2], 0);
});

test('resume event occurs before gameplay continues on the resume step', () => {
  const simulation = makeSimulation();
  simulation.step({ pause: true });
  simulation.step({ pause: false });
  const resumed = simulation.step({ move: [0, 1], pause: true });

  assert.equal(resumed[0].name, 'resumed');
  assert.equal(simulation.tick, 3);
  assert.equal(simulation.simTick, 1);
  assert.equal(simulation.timeLeftS, 10 - 1 / 60);
  assert.equal(simulation.player.pos[2], contract.tuning.player_speed / 60);
  assert.equal(simulation.snapshot().state, 'playing');
});

test('pause is a validated stateful boolean input', () => {
  assert.doesNotThrow(() => validateInputs({ frames: [{ tick: 0, pause: true }, { tick: 1, pause: false }] }));
  assert.throws(() => validateInputs({ frames: [{ tick: 0, pause: 1 }] }), /must be boolean/);
});

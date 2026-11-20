import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Simulation } from '../src/core/simulation.js';

const phase1Contract = JSON.parse(await readFile(new URL('../../game.contract.json', import.meta.url), 'utf8'));
const tuning = {
  ...structuredClone(phase1Contract.tuning),
  score: {
    per_mote: 10,
    per_lantern: 100,
    per_stun: 5,
    per_second_left: 2,
    per_flame_left: 50,
  },
};

function makeSimulation(scenario) {
  return new Simulation({ seed: 9, tuning, scenario, contractVersion: '1.1' });
}

test('Phase 2 awards mote points on deposit instead of pickup', () => {
  const simulation = makeSimulation({
    random_motes: false,
    random_shades: false,
    motes: [[0, 0, 0.5], [0, 0, 0.6]],
    lanterns: [{ id: 'L1', pos: [0, 0, 1] }],
  });

  simulation.step({});
  assert.equal(simulation.player.carried, 2);
  assert.equal(simulation.score, 0);

  simulation.step({ interact: true });
  assert.equal(simulation.player.carried, 0);
  assert.equal(simulation.lanterns[0].deposited, 2);
  assert.equal(simulation.score, 20);
});

test('Phase 2 awards five points for every shade hit by each pulse', () => {
  const simulation = makeSimulation({
    player: { carried: 2 },
    random_motes: false,
    random_shades: false,
    shades: [
      { id: 'S1', pos: [2, 0, 0] },
      { id: 'S2', pos: [-2, 0, 0] },
    ],
  });

  simulation.step({ pulse: true });
  assert.equal(simulation.score, 10);
});

test('Phase 2 win bonus uses floor(seconds) × 2 plus 50 × remaining flames', () => {
  const simulation = makeSimulation({
    time_left_s: 1.5,
    player: { pos: [0, 0, 0], carried: 1, flames: 2 },
    random_motes: false,
    random_shades: false,
    lanterns: [
      { id: 'L1', pos: [0, 0, 1], deposited: tuning.lantern_cost - 1 },
      { id: 'L2', lit: true },
      { id: 'L3', lit: true },
      { id: 'L4', lit: true },
      { id: 'L5', lit: true },
    ],
  });

  simulation.step({ interact: true });
  assert.equal(simulation.state, 'won');
  assert.equal(simulation.score, 10 + 100 + 2 + 100);
});

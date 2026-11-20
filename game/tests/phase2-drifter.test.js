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

function makeSimulation({ player = {}, drifters = [], shades = [] } = {}) {
  return new Simulation({
    seed: 12,
    tuning,
    contractVersion: '1.1',
    night: 2,
    scenario: {
      player,
      drifters,
      shades,
      random_motes: false,
      random_shades: false,
      random_drifters: false,
    },
  });
}

test('drifter changes between idle and chase using the carried and distance thresholds', () => {
  const simulation = makeSimulation({
    player: { carried: 5 },
    drifters: [{ id: 'D1', pos: [10, 0, 0], state: 'idle' }],
  });
  simulation.step({});
  assert.equal(simulation.drifters[0].state, 'chase');
  assert.ok(Math.abs(simulation.drifters[0].pos[0] - (10 - 7 / 60)) < 1e-10);

  simulation.player.carried = 4;
  simulation.step({});
  assert.equal(simulation.drifters[0].state, 'idle');
});

test('drifter steals before a shade hit and flees for 240 ticks', () => {
  const simulation = makeSimulation({
    player: { carried: 5, flames: 3 },
    drifters: [{ id: 'D1', pos: [0.5, 0, 0], state: 'chase' }],
    shades: [{ id: 'S1', pos: [0.5, 0, 0] }],
  });
  const events = simulation.step({});

  assert.deepEqual(events.map((event) => event.name), ['drifter_steal', 'player_hit']);
  assert.deepEqual(events[0].data, { drifter_id: 'D1', amount: 3, carried: 2 });
  assert.equal(simulation.player.carried, 1);
  assert.equal(simulation.player.flames, 2);
  assert.equal(simulation.drifters[0].state, 'flee');
  assert.equal(simulation.drifters[0].stateTicksLeft, 240);
});

test('pulse makes a chasing drifter flee without stealing', () => {
  const simulation = makeSimulation({
    player: { carried: 1 },
    drifters: [{ id: 'D1', pos: [2, 0, 0], state: 'chase' }],
  });
  const events = simulation.step({ pulse: true });

  assert.equal(events[0].name, 'pulse');
  assert.equal(simulation.player.carried, 0);
  assert.equal(simulation.drifters[0].state, 'flee');
  assert.equal(simulation.drifters[0].stolen, 0);
  assert.equal(simulation.drifters[0].stateTicksLeft, 240);
});

test('pulse makes a fleeing drifter drop every stolen mote and shortens removal to 120 ticks', () => {
  const simulation = makeSimulation({
    player: { carried: 1 },
    drifters: [{ id: 'D1', pos: [2, 0, 0], state: 'flee', stolen: 3, state_ticks_left: 200 }],
  });
  const events = simulation.step({ pulse: true });

  assert.deepEqual(events.map((event) => event.name), ['pulse', 'drifter_drop']);
  assert.deepEqual(events[1].data, { drifter_id: 'D1', amount: 3 });
  assert.equal(simulation.drifters[0].stolen, 0);
  assert.equal(simulation.drifters[0].stateTicksLeft, 120);
  assert.equal(simulation.motes.length, 3);
  assert.deepEqual(simulation.snapshot().drifters[0], {
    id: 'D1',
    pos: simulation.snapshot().drifters[0].pos,
    state: 'flee',
    stolen: 0,
  });
});

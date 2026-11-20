import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Simulation } from '../src/core/simulation.js';
import { validateInputs } from '../src/headless/inputs.js';

const contract = JSON.parse(await readFile(new URL('../../game.contract.json', import.meta.url), 'utf8'));
const tuning = contract.tuning;

function makeSimulation(scenario = {}) {
  return new Simulation({ seed: 42, tuning, scenario });
}

test('contract declares the five Night 1 lanterns', () => {
  const simulation = makeSimulation({ random_motes: false, random_shades: false });
  assert.deepEqual(simulation.lanterns.map((lantern) => lantern.id), ['L1', 'L2', 'L3', 'L4', 'L5']);
  assert.equal(simulation.snapshot().tick, 0);
});

test('movement respects camera yaw and normalizes input', () => {
  const simulation = makeSimulation({ random_motes: false, random_shades: false });
  simulation.step({ move: [0, 1], cam_yaw_deg: 90 });
  assert.ok(Math.abs(simulation.player.pos[0] - 0.1) < 1e-10);
  assert.ok(Math.abs(simulation.player.pos[2]) < 1e-10);

  const diagonal = makeSimulation({ random_motes: false, random_shades: false });
  diagonal.step({ move: [1, 1], cam_yaw_deg: 0 });
  assert.ok(Math.abs(Math.hypot(diagonal.player.pos[0], diagonal.player.pos[2]) - 0.1) < 1e-10);
});

test('jump is rising-edge triggered and returns to the ground', () => {
  const simulation = makeSimulation({ random_motes: false, random_shades: false });
  simulation.step({ jump: true });
  assert.ok(simulation.player.pos[1] > 0);
  for (let tick = 0; tick < 120; tick += 1) simulation.step({ jump: true });
  assert.equal(simulation.player.pos[1], 0);
});

test('nearby motes are collected automatically up to capacity', () => {
  const simulation = makeSimulation({
    random_motes: false,
    random_shades: false,
    motes: Array.from({ length: tuning.carry_capacity + 2 }, () => [0, 0, 0.5]),
  });
  const events = simulation.step({});
  assert.equal(simulation.player.carried, tuning.carry_capacity);
  assert.equal(events.filter((event) => event.name === 'mote_picked').length, tuning.carry_capacity);
  assert.equal(simulation.score, tuning.carry_capacity * tuning.score.per_mote);
});

test('interact deposits motes, lights the lantern, and wins when all are lit', () => {
  const simulation = makeSimulation({
    player: { pos: [0, 0, 0], carried: tuning.lantern_cost, flames: 3 },
    random_motes: false,
    random_shades: false,
    lanterns: [
      { id: 'L1', pos: [0, 0, 1] },
      { id: 'L2', lit: true },
      { id: 'L3', lit: true },
      { id: 'L4', lit: true },
      { id: 'L5', lit: true }
    ]
  });
  const events = simulation.step({ interact: true });
  assert.equal(simulation.lanterns[0].lit, true);
  assert.equal(simulation.player.carried, 0);
  assert.equal(simulation.state, 'won');
  assert.deepEqual(events.map((event) => event.name), ['deposit', 'lantern_lit', 'game_over']);
});

test('pulse consumes one mote, pushes and stuns shades in range', () => {
  const simulation = makeSimulation({
    player: { pos: [0, 0, 0], carried: tuning.pulse_cost + 1, flames: 3 },
    random_motes: false,
    random_shades: false,
    shades: [{ id: 'S-test', pos: [2, 0, 0] }]
  });
  const events = simulation.step({ pulse: true });
  assert.equal(simulation.player.carried, 1);
  assert.equal(simulation.shades[0].state, 'stunned');
  assert.equal(simulation.shades[0].pos[0], 6);
  assert.deepEqual(events[0], { name: 'pulse', data: { stunned_ids: ['S-test'] } });
});

test('shade hit removes a flame and drops floor(ratio × carried) motes', () => {
  const simulation = makeSimulation({
    player: { pos: [0, 0, 0], carried: 5, flames: 2 },
    random_motes: false,
    random_shades: false,
    shades: [{ id: 'S-test', pos: [0.5, 0, 0] }]
  });
  const events = simulation.step({});
  assert.equal(simulation.player.flames, 1);
  assert.equal(simulation.player.carried, 3);
  assert.equal(simulation.motes.length, 2);
  assert.deepEqual(events.at(-1), { name: 'player_hit', data: { by: 'shade', flames: 1, dropped: 2 } });
});

test('lit lantern safe radius keeps shades out', () => {
  const simulation = makeSimulation({
    player: { pos: [10, 0, 0], carried: 0, flames: 3 },
    random_motes: false,
    random_shades: false,
    shades: [{ id: 'S-test', pos: [1, 0, 0] }],
    lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }]
  });
  simulation.step({});
  assert.ok(Math.abs(Math.hypot(simulation.shades[0].pos[0], simulation.shades[0].pos[2]) - tuning.safe_radius) < 1e-10);
  assert.equal(simulation.shades[0].state, 'flee');
});

test('dawn ends the game after the exact number of fixed steps', () => {
  const simulation = makeSimulation({ random_motes: false, random_shades: false, time_left_s: 1 / 60 });
  const events = simulation.step({});
  assert.equal(simulation.tick, 1);
  assert.equal(simulation.state, 'lost');
  assert.deepEqual(events.at(-1), { name: 'game_over', data: { result: 'lost', reason: 'dawn' } });
});

test('input frames must be strictly increasing and within the contract schema', () => {
  assert.throws(
    () => validateInputs({ frames: [{ tick: 1 }, { tick: 1 }] }),
    /strictly increasing/
  );
  assert.throws(
    () => validateInputs({ frames: [{ tick: 0, move: [2, 0] }] }),
    /\[-1, 1\]/
  );
  assert.throws(
    () => validateInputs({ frames: [{ tick: 0, fire: true }] }),
    /unknown field/
  );
});

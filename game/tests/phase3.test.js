import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Simulation, TICK_RATE } from '../src/core/simulation.js';

const contract = JSON.parse(await readFile(new URL('../../game.contract.json', import.meta.url), 'utf8'));
const { tuning } = contract;

function makeSimulation(scenario = {}, night = 1) {
  return new Simulation({ seed: 33, tuning, scenario, contractVersion: '1.2', night });
}

const quiet = { random_motes: false, random_shades: false, random_drifters: false, charms: [] };

test('contract v1.2 centralizes every mandatory Phase 3 tuning value', () => {
  assert.equal(contract.contract_version, '1.2');
  assert.deepEqual(
    Object.fromEntries(['fuel_max', 'fuel_decay_per_s', 'fuel_per_mote', 'relight_cost', 'win_ratio', 'drain_per_s', 'low_fuel_threshold', 'capacity_max'].map((key) => [key, tuning[key]])),
    { fuel_max: 100, fuel_decay_per_s: 1, fuel_per_mote: 10, relight_cost: 5, win_ratio: 0.6, drain_per_s: 5, low_fuel_threshold: 30, capacity_max: 20 },
  );
  assert.deepEqual([tuning.night1_duration_s, tuning.night2_duration_s, tuning.night3_duration_s], [240, 270, 300]);
});

test('scenario lantern defaults and v1.2 snapshot expose fuel history and capacity without side effects', () => {
  const simulation = makeSimulation({
    ...quiet,
    player: { successful_lights: 2 },
    lanterns: [{ id: 'L1', lit: true }],
  });
  const snapshot = simulation.snapshot();
  assert.equal(simulation.score, 0);
  assert.deepEqual(snapshot.lanterns[0], {
    id: 'L1', pos: [0, 0, 25], lit: true, deposited: 0, fuel: 100, ever_lit: true, relit_count: 0,
  });
  assert.equal(snapshot.player.capacity, 14);
  assert.throws(
    () => makeSimulation({ ...quiet, shades: [{ id: 'S1', pos: [0, 0, 0], state: 'drain', target_lantern_id: 'missing' }] }),
    /known lantern id/,
  );
});

test('lit lantern fuel uses exact sixtieth units and every gameplay timer freezes while paused', () => {
  const simulation = makeSimulation({ ...quiet, lanterns: [{ id: 'L1', lit: true }] });
  for (let tick = 0; tick < TICK_RATE; tick += 1) simulation.step({});
  assert.equal(simulation.lanterns[0].fuelUnits, 99 * TICK_RATE);
  assert.equal(simulation.snapshot().lanterns[0].fuel, 99);
  simulation.step({ pause: true });
  for (let tick = 0; tick < 10; tick += 1) simulation.step({});
  assert.equal(simulation.lanterns[0].fuelUnits, 99 * TICK_RATE);
});

test('first lighting awards the new score, grows capacity, and never wins early', () => {
  const simulation = makeSimulation({
    ...quiet,
    player: { pos: [0, 0, 0], carried: 10 },
    lanterns: [
      { id: 'L1', pos: [0, 0, 1] },
      { id: 'L2', lit: true }, { id: 'L3', lit: true }, { id: 'L4', lit: true }, { id: 'L5', lit: true },
    ],
  });
  const events = simulation.step({ interact: true });
  assert.equal(simulation.state, 'playing');
  assert.equal(simulation.score, 150);
  assert.equal(simulation.capacity, 12);
  assert.equal(simulation.lanterns[0].fuel, 100);
  assert.deepEqual(events.find((event) => event.name === 'lantern_lit'), { name: 'lantern_lit', data: { lantern_id: 'L1', relight: false } });
});

test('lanterns go out at zero and relight for five motes with relight history and score', () => {
  const expiring = makeSimulation({ ...quiet, lanterns: [{ id: 'L1', lit: true, fuel: 1 / 60 }] });
  const outEvents = expiring.step({});
  assert.equal(expiring.lanterns[0].lit, false);
  assert.equal(expiring.lanterns[0].deposited, 0);
  assert.deepEqual(outEvents.find((event) => event.name === 'lantern_out'), { name: 'lantern_out', data: { lantern_id: 'L1' } });

  const simulation = makeSimulation({
    ...quiet,
    player: { pos: [0, 0, 0], carried: 5 },
    lanterns: [{ id: 'L1', pos: [0, 0, 1], lit: false, ever_lit: true }],
  });
  const events = simulation.step({ interact: true });
  assert.equal(simulation.score, 65);
  assert.equal(simulation.lanterns[0].relitCount, 1);
  assert.equal(simulation.capacity, 12);
  assert.deepEqual(events.find((event) => event.name === 'lantern_lit'), { name: 'lantern_lit', data: { lantern_id: 'L1', relight: true } });
});

test('refuel consumes ceil missing fuel per ten and crossing 30 repels nearby shades', () => {
  const simulation = makeSimulation({
    ...quiet,
    player: { pos: [0, 0, 0], carried: 3 },
    lanterns: [{ id: 'L1', pos: [0, 0, 1], lit: true, fuel: 25 }],
    shades: [{ id: 'S1', pos: [0, 0, 6.5], state: 'wander', target_lantern_id: 'L1' }],
  });
  const events = simulation.step({ interact: true });
  assert.equal(simulation.player.carried, 0);
  assert.equal(simulation.snapshot().lanterns[0].fuel, 55);
  assert.equal(simulation.score, 15);
  assert.equal(simulation.shades[0].state, 'recoil');
  assert.equal(Math.hypot(simulation.shades[0].pos[0], simulation.shades[0].pos[2] - 1), 6);
  assert.deepEqual(events.find((event) => event.name === 'refuel'), { name: 'refuel', data: { lantern_id: 'L1', amount: 3, fuel: 55 } });
});

test('wander shades prioritize weak lit lanterns and drain five fuel per second with periodic evidence', () => {
  const simulation = makeSimulation({
    ...quiet,
    player: { pos: [20, 0, 20] },
    lanterns: [
      { id: 'L1', pos: [0, 0, 0], lit: true, fuel: 20 },
      { id: 'L2', pos: [1, 0, 0], lit: true, fuel: 20 },
    ],
    shades: [{ id: 'S1', pos: [0, 0, 1], state: 'wander' }],
  });
  simulation.step({});
  assert.equal(simulation.shades[0].targetLanternId, 'L1');
  assert.equal(simulation.shades[0].state, 'drain');
  let drainEvent;
  for (let tick = 0; tick < TICK_RATE; tick += 1) {
    drainEvent = simulation.step({}).find((event) => event.name === 'fuel_drain') ?? drainEvent;
  }
  assert.equal(simulation.lanterns[0].fuelUnits, 14 * TICK_RATE - 1);
  assert.equal(drainEvent.data.shade_id, 'S1');
  assert.equal(drainEvent.data.lantern_id, 'L1');
});

test('pulse gives a total of fifteen points for a shade that was draining', () => {
  const simulation = makeSimulation({
    ...quiet,
    player: { pos: [0, 0, 0], carried: tuning.pulse_cost },
    lanterns: [{ id: 'L1', pos: [1, 0, 0], lit: true, fuel: 20 }],
    shades: [{ id: 'S1', pos: [1, 0, 0], state: 'drain', target_lantern_id: 'L1' }],
  });
  simulation.step({ pulse: true });
  assert.equal(simulation.score, 15);
  assert.equal(simulation.shades[0].state, 'stunned');
});

test('dawn requires sixty percent lit, applies only the new bonus, and no_flames wins the final-tick priority', () => {
  const lanterns = [
    { id: 'L1', lit: true }, { id: 'L2', lit: true }, { id: 'L3', lit: true },
    { id: 'L4', lit: false }, { id: 'L5', lit: false },
  ];
  const won = makeSimulation({ ...quiet, time_left_s: 1 / 60, player: { flames: 3 }, lanterns });
  const winEvents = won.step({});
  assert.equal(won.state, 'won');
  assert.equal(won.score, 597);
  assert.deepEqual(winEvents.at(-1), { name: 'game_over', data: { result: 'won', reason: 'dawn_survived' } });

  const lost = makeSimulation({ ...quiet, time_left_s: 1 / 60, player: { flames: 0 }, lanterns });
  const lossEvents = lost.step({});
  assert.equal(lost.score, 0);
  assert.deepEqual(lossEvents.at(-1), { name: 'game_over', data: { result: 'lost', reason: 'no_flames' } });
});

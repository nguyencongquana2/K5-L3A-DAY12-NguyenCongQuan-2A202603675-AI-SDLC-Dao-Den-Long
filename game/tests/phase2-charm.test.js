import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Simulation } from '../src/core/simulation.js';

const contract = JSON.parse(await readFile(new URL('../../game.contract.json', import.meta.url), 'utf8'));

function makeNight2() {
  return new Simulation({
    seed: 3,
    tuning: contract.tuning,
    contractVersion: '1.1',
    night: 2,
    scenario: {
      player: { pos: [35, 0, 0] },
      random_motes: false,
      random_shades: false,
    },
  });
}

test('Night 2 charm pickup emits the required event and lasts 600 ticks', () => {
  const simulation = makeNight2();
  const events = simulation.step({});

  assert.deepEqual(events[0], { name: 'charm_picked', data: { charm_id: 'C1', charm_ticks: 600 } });
  assert.equal(simulation.player.charmTicks, 600);
  assert.equal(simulation.charms[0].available, false);
  assert.equal(simulation.charms[0].respawnTicks, 2700);
  assert.deepEqual(simulation.snapshot().charms, [{ id: 'C1', available: false, respawn_s: 45 }]);
  assert.equal(simulation.snapshot().player.charm_s, 10);
});

test('active charm changes run speed to 7.2 m/s and pause freezes its timer', () => {
  const simulation = makeNight2();
  simulation.step({});
  simulation.player.pos = [0, 0, 0];

  simulation.step({ move: [1, 0] });
  assert.ok(Math.abs(simulation.player.pos[0] - 7.2 / 60) < 1e-10);
  assert.equal(simulation.player.charmTicks, 599);

  simulation.step({ pause: true });
  simulation.step({ pause: false });
  assert.equal(simulation.player.charmTicks, 599);
  assert.equal(simulation.charms[0].respawnTicks, 2699);
});

test('charm expires after 600 simulation ticks and respawns after 2700', () => {
  const simulation = makeNight2();
  simulation.step({});
  simulation.player.pos = [0, 0, 0];

  for (let tick = 0; tick < 600; tick += 1) simulation.step({});
  assert.equal(simulation.player.charmTicks, 0);
  assert.equal(simulation.charms[0].available, false);

  for (let tick = 600; tick < 2700; tick += 1) simulation.step({});
  assert.equal(simulation.charms[0].available, true);
  assert.equal(simulation.charms[0].respawnTicks, 0);
});

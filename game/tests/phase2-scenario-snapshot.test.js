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

function makeSimulation(scenario) {
  return new Simulation({ seed: 14, tuning, contractVersion: '1.1', night: 3, scenario });
}

test('v1.1 scenario sets player counters and replaces shades, drifters and charms without events', () => {
  const simulation = makeSimulation({
    player: {
      pos: [1, 0, 2],
      carried: 4,
      flames: 2,
      invuln_ticks: 30,
      dash_cd_ticks: 45,
      pulse_cd_ticks: 50,
      charm_ticks: 60,
    },
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    shades: [{ id: 'S9', pos: [9, 0, 0], state: 'stunned', state_ticks_left: 10 }],
    drifters: [{ id: 'D9', pos: [20, 0, 0], state: 'flee', stolen: 2, state_ticks_left: 90 }],
    charms: [{ id: 'C9', pos: [3, 0, 4], available: false, respawn_ticks: 120 }],
    wind_enabled: false,
  });

  assert.equal(simulation.score, 0);
  assert.equal(simulation.player.invulnTicks, 30);
  assert.equal(simulation.player.dashCooldownTicks, 45);
  assert.equal(simulation.player.pulseCooldownTicks, 50);
  assert.equal(simulation.player.charmTicks, 60);
  assert.deepEqual(simulation.shades.map((shade) => shade.id), ['S9']);
  assert.deepEqual(simulation.drifters.map((drifter) => drifter.id), ['D9']);
  assert.deepEqual(simulation.charms.map((charm) => charm.id), ['C9']);
  assert.equal(simulation.windEnabled, false);
});

test('v1.1 snapshot exposes the required night, wind, player, entity and mote fields', () => {
  const simulation = makeSimulation({
    player: { invuln_ticks: 2, dash_cd_ticks: 60, pulse_cd_ticks: 30, charm_ticks: 120 },
    motes: [[1, 0, 1]],
    random_shades: false,
    random_drifters: false,
    drifters: [{ id: 'D1', pos: [10, 0, 0], state: 'idle', stolen: 0 }],
    charms: [{ id: 'C1', pos: [3, 0, 4], available: false, respawn_ticks: 60 }],
  });
  const snapshot = simulation.snapshot();

  assert.equal(snapshot.night, 3);
  assert.deepEqual(snapshot.wind, { active: false, dir_deg: 0 });
  assert.deepEqual(snapshot.player.vel, [0, 0, 0]);
  assert.equal(snapshot.player.grounded, true);
  assert.equal(snapshot.player.invuln, true);
  assert.equal(snapshot.player.dash_cd_s, 1);
  assert.equal(snapshot.player.pulse_cd_s, 0.5);
  assert.equal(snapshot.player.charm_s, 2);
  assert.deepEqual(snapshot.motes[0], { id: 'M1', pos: [1, 0, 1], kind: 'random', ttl_s: null });
  assert.deepEqual(snapshot.drifters[0], { id: 'D1', pos: [10, 0, 0], state: 'idle', stolen: 0 });
  assert.deepEqual(snapshot.charms[0], { id: 'C1', available: false, respawn_s: 1 });
});

test('v1.1 counters and TTL freeze while paused and decrease on simulation steps', () => {
  const simulation = makeSimulation({
    player: { invuln_ticks: 2, dash_cd_ticks: 2, pulse_cd_ticks: 2, charm_ticks: 2 },
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    shades: [{ id: 'S1', pos: [20, 0, 0], state: 'stunned', state_ticks_left: 2 }],
    charms: [{ id: 'C1', pos: [30, 0, 0], available: false, respawn_ticks: 2 }],
  });
  simulation.motes = [{ id: 'D1', pos: [10, 0, 0], kind: 'dropped', ttlTicks: 2 }];

  simulation.step({ pause: true });
  simulation.step({ pause: false });
  assert.equal(simulation.player.invulnTicks, 2);
  assert.equal(simulation.shades[0].stateTicksLeft, 2);
  assert.equal(simulation.charms[0].respawnTicks, 2);
  assert.equal(simulation.motes[0].ttlTicks, 2);

  simulation.step({ pause: true });
  assert.equal(simulation.player.invulnTicks, 1);
  assert.equal(simulation.shades[0].stateTicksLeft, 1);
  assert.equal(simulation.charms[0].respawnTicks, 1);
  assert.equal(simulation.motes[0].ttlTicks, 1);
});

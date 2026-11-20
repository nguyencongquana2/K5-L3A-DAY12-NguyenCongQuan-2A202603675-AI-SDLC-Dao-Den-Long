import assert from 'node:assert/strict';
import test from 'node:test';
import { getNightConfig, ringPoints } from '../src/core/night-configs.js';

const radiusFrom = (point, center = [0, 0, 0]) => Math.hypot(point[0] - center[0], point[2] - center[2]);

test('ring points follow the +X counter-clockwise XZ convention', () => {
  const points = ringPoints({ radius: 10, count: 4, stepDeg: 90 });
  assert.ok(Math.abs(points[0][0] - 10) < 1e-10);
  assert.ok(Math.abs(points[0][2]) < 1e-10);
  assert.ok(Math.abs(points[1][0]) < 1e-10);
  assert.ok(Math.abs(points[1][2] - 10) < 1e-10);
});

test('Night 1 uses the standard island, lanterns, spawn rings and shade schedule', () => {
  const config = getNightConfig(1);
  assert.equal(config.terrain.islands[0].radius, 40);
  assert.deepEqual(config.lanterns.map(({ id, pos }) => ({ id, pos })), [
    { id: 'L1', pos: [0, 0, 25] },
    { id: 'L2', pos: [23.8, 0, 7.7] },
    { id: 'L3', pos: [14.7, 0, -20.2] },
    { id: 'L4', pos: [-14.7, 0, -20.2] },
    { id: 'L5', pos: [-23.8, 0, 7.7] },
  ]);
  assert.equal(config.moteSpawnPoints.length, 24);
  assert.equal(config.shadeSpawnPoints.length, 12);
  assert.ok(config.shadeSpawnPoints.every((point) => Math.abs(radiusFrom(point) - 37) < 1e-10));
  assert.deepEqual(config.shadeSchedule, { firstTick: 300, firstCount: 2, intervalTicks: 480, maxAlive: 6 });
});

test('Night 2 defines both islands, bridge, launch pads and per-island spawn points', () => {
  const config = getNightConfig(2);
  assert.equal(config.start, null, 'the supplied ticket does not define the Night 2 player start');
  assert.deepEqual(config.terrain.islands.map(({ center, radius }) => ({ center, radius })), [
    { center: [0, 0, 0], radius: 28 },
    { center: [70, 0, 0], radius: 28 },
  ]);
  assert.deepEqual(config.terrain.bridges[0], { id: 'bridge-A-B', x: [26, 44], z: [-2, 2], y: 0, rails: false });
  assert.equal(config.terrain.launchPads.length, 2);
  assert.equal(config.lanterns.length, 6);
  assert.equal(config.moteSpawnPoints.length, 24);
  assert.equal(config.shadeSpawnPoints.length, 16);
  assert.deepEqual(config.shadeSchedule, { intervalTicks: 420, maxAlive: 8 });
  assert.deepEqual(config.drifterSchedule, { firstTick: 1200, intervalTicks: 1200, maxAlive: 2 });
  assert.deepEqual(config.charms, [{ id: 'C1', pos: [35, 0, 0] }]);
});

test('Night 3 defines three levels, ramps, tower, wind and the standard entities', () => {
  const config = getNightConfig(3);
  assert.equal(config.start, null, 'the supplied ticket does not define the Night 3 player start');
  assert.deepEqual(config.terrain.tiers.map((tier) => tier.y), [0, 3, 6]);
  assert.deepEqual(config.terrain.ramps.map((ramp) => ramp.angleDeg), [30, 150]);
  assert.deepEqual(config.terrain.tower, { pos: [0, 6, 0], radius: 2, height: 8, climbable: false });
  assert.equal(config.lanterns.length, 7);
  assert.equal(config.moteSpawnPoints.length, 30);
  assert.equal(config.shadeSpawnPoints.length, 16);
  assert.deepEqual(config.shadeSchedule, { intervalTicks: 360, maxAlive: 10 });
  assert.deepEqual(config.wind, { intervalTicks: 1800, warningTicks: 120, activeTicks: 300, pushSpeed: 2 });
  assert.deepEqual(config.charms.map((charm) => charm.id), ['C1', 'C2']);
});

test('night configs are returned as isolated copies and reject unsupported nights', () => {
  const first = getNightConfig(1);
  first.lanterns[0].pos[0] = 999;
  assert.equal(getNightConfig(1).lanterns[0].pos[0], 0);
  assert.throws(() => getNightConfig(4), /night must be 1, 2, or 3/);
});

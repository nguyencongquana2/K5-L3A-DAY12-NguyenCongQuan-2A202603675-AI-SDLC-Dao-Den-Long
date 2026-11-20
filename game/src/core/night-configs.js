import { TICK_RATE } from './constants.js';

const toTicks = (seconds) => seconds * TICK_RATE;
const degreesToRadians = (degrees) => (degrees * Math.PI) / 180;

export function ringPoints({ center = [0, 0, 0], radius, count, startDeg = 0, stepDeg = 360 / count }) {
  return Array.from({ length: count }, (_, index) => {
    const angle = degreesToRadians(startDeg + stepDeg * index);
    return [
      center[0] + Math.cos(angle) * radius,
      center[1],
      center[2] + Math.sin(angle) * radius,
    ];
  });
}

const lanterns = (positions) => positions.map((pos, index) => ({ id: `L${index + 1}`, pos }));

const night1 = {
  night: 1,
  start: { pos: [0, 0, 0], facing: [0, 0, 1] },
  terrain: {
    islands: [{ id: 'A', center: [0, 0, 0], radius: 40 }],
    bridges: [],
    tiers: [],
    ramps: [],
    launchPads: [],
  },
  lanterns: lanterns([
    [0, 0, 25],
    [23.8, 0, 7.7],
    [14.7, 0, -20.2],
    [-14.7, 0, -20.2],
    [-23.8, 0, 7.7],
  ]),
  moteSpawnPoints: [
    ...ringPoints({ radius: 12, count: 8, stepDeg: 45 }),
    ...ringPoints({ radius: 33, count: 16, stepDeg: 22.5 }),
  ],
  shadeSpawnPoints: ringPoints({ radius: 37, count: 12, startDeg: 15, stepDeg: 30 }),
  shadeSchedule: { firstTick: toTicks(5), firstCount: 2, intervalTicks: toTicks(8), maxAlive: 6 },
  drifterSchedule: null,
  charms: [],
  wind: null,
};

const night2Centers = [
  [0, 0, 0],
  [70, 0, 0],
];

const night2 = {
  night: 2,
  start: { pos: [0, 0, 0], facing: [0, 0, 1], assumed: true },
  terrain: {
    islands: night2Centers.map((center, index) => ({ id: index === 0 ? 'A' : 'B', center, radius: 28 })),
    bridges: [{ id: 'bridge-A-B', x: [26, 44], z: [-2, 2], y: 0, rails: false }],
    tiers: [],
    ramps: [],
    launchPads: [
      { id: 'P1', pos: [20, 0, 18], radius: 1, velocityY: 14, horizontalSpeed: 24, target: [70, 0, 0] },
      { id: 'P2', pos: [50, 0, -18], radius: 1, velocityY: 14, horizontalSpeed: 24, target: [0, 0, 0] },
    ],
  },
  lanterns: lanterns([
    [0, 0, 20],
    [17, 0, -10],
    [-17, 0, -10],
    [70, 0, 20],
    [87, 0, -10],
    [53, 0, -10],
  ]),
  moteSpawnPoints: night2Centers.flatMap((center) => [
    ...ringPoints({ center, radius: 10, count: 4, stepDeg: 90 }),
    ...ringPoints({ center, radius: 22, count: 8, stepDeg: 45 }),
  ]),
  shadeSpawnPoints: night2Centers.flatMap((center) =>
    ringPoints({ center, radius: 26, count: 8, startDeg: 22.5, stepDeg: 45 })
  ),
  shadeSchedule: { intervalTicks: toTicks(7), maxAlive: 8 },
  drifterSchedule: { firstTick: 1200, intervalTicks: 1200, maxAlive: 2 },
  charms: [{ id: 'C1', pos: [35, 0, 0] }],
  wind: null,
};

const night3 = {
  night: 3,
  start: { pos: [0, 0, -30], facing: [0, 0, 1], assumed: true },
  terrain: {
    islands: [{ id: 'A', center: [0, 0, 0], radius: 45 }],
    bridges: [],
    tiers: [
      { id: 'T0', y: 0, shape: 'disc', radius: 45 },
      { id: 'T1', y: 3, shape: 'half-annulus', innerRadius: 12, outerRadius: 24, condition: 'z > 0' },
      { id: 'T2', y: 6, shape: 'disc', radius: 8 },
    ],
    ramps: [
      { id: 'R1', angleDeg: 30, width: 3, startRadius: 30, startY: 0, endRadius: 24, endY: 3 },
      { id: 'R2', angleDeg: 150, width: 3, startRadius: 30, startY: 0, endRadius: 24, endY: 3 },
    ],
    launchPads: [
      { id: 'P1', pos: [0, 3, 13], radius: 1, velocityY: 12, horizontalSpeed: 8, direction: [0, 0, -1] },
    ],
    tower: { pos: [0, 6, 0], radius: 2, height: 8, climbable: false },
  },
  lanterns: lanterns([
    [0, 6, 6],
    [18, 3, 10],
    [-18, 3, 10],
    [35, 0, -10],
    [-35, 0, -10],
    [20, 0, -35],
    [-20, 0, -35],
  ]),
  moteSpawnPoints: [
    ...ringPoints({ center: [0, 0, 0], radius: 34, count: 18, stepDeg: 20 }),
    ...ringPoints({ center: [0, 3, 0], radius: 18, count: 8, startDeg: 20, stepDeg: 20 }),
    ...ringPoints({ center: [0, 6, 0], radius: 5, count: 4, startDeg: 45, stepDeg: 90 }),
  ],
  shadeSpawnPoints: ringPoints({ radius: 43, count: 16, stepDeg: 22.5 }),
  shadeSchedule: { intervalTicks: toTicks(6), maxAlive: 10 },
  drifterSchedule: { firstTick: 1200, intervalTicks: 1200, maxAlive: 2 },
  charms: [
    { id: 'C1', pos: [30, 0, 25] },
    { id: 'C2', pos: [-30, 0, 25] },
  ],
  wind: { intervalTicks: toTicks(30), warningTicks: toTicks(2), activeTicks: toTicks(5), pushSpeed: 2 },
};

export const NIGHT_CONFIGS = Object.freeze({ 1: night1, 2: night2, 3: night3 });

export function getNightConfig(night) {
  const config = NIGHT_CONFIGS[night];
  if (!config) throw new Error(`night must be 1, 2, or 3; received ${night}`);
  return structuredClone(config);
}

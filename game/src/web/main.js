import * as THREE from 'three';
import contract from '../../../game.contract.json';
import { ISLAND_RADIUS, Simulation, TICK_RATE } from '../core/simulation.js';
import { SeededRng } from '../core/rng.js';
import { addLeaderboardEntry, normalizeLeaderboard } from '../core/leaderboard.js';
import './style.css';

const canvas = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.16;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x160d2d);
scene.fog = new THREE.FogExp2(0x21153b, 0.017);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 180);
const clock = new THREE.Clock();
let accumulator = 0;
let simulation;
let playing = false;
let cameraYaw = 0;
let cameraPitch = 0.38;
let toastTimeout;
let pauseRequested = false;
let requestPointerLockAfterResume = false;
let currentNight = 1;
let totalScore = 0;
let lastCountdownSecond = null;
let previousShadeCount = 0;
let benchmarkMode = false;
let benchmarkCameraStart = 0;
let nightsWon = 0;
let shadeAlertUntil = 0;
let shadeAlertShadeId = null;
let settingsReturn = 'pause';
let rebindingAction = null;

const SESSION_SEED = 2026;
const LEADERBOARD_KEY = 'dao-den-long.leaderboard.v1';
const DEFAULT_BINDINGS = Object.freeze({
  moveForward: 'KeyW',
  moveBackward: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  jump: 'Space',
  dash: 'ShiftLeft',
  interact: 'KeyE',
  pulse: 'KeyQ',
  pause: 'KeyP',
});

const NIGHT_STORIES = {
  1: { name: 'Đảo Khởi Quang', words: 'Ông Đăng: “Thắp đèn chỉ là khởi đầu. Hãy giữ ít nhất ba ngọn sáng cho tới bình minh.”' },
  2: { name: 'Song Đảo Cầu Tre', words: 'Ông Đăng: “Qua cầu không lan can, hãy châm dầu và giữ ít nhất bốn ngọn sáng.”' },
  3: { name: 'Đảo Tháp Gió', words: 'Ông Đăng: “Đêm cuối ở trên cao. Năm ngọn đèn còn sáng sẽ dẫn bình minh trở về.”' },
};

const SETTINGS_KEY = 'dao-den-long.settings.v1';

function loadSettings() {
  const defaults = {
    volume: 0.7,
    sensitivity: 1,
    distinguishablePalette: false,
    reducedMotion: false,
    largeText: false,
    bindings: { ...DEFAULT_BINDINGS },
  };
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    const bindings = { ...DEFAULT_BINDINGS, ...(stored.bindings ?? {}) };
    const validBindings = Object.keys(DEFAULT_BINDINGS).every((action) => typeof bindings[action] === 'string') &&
      new Set(Object.values(bindings)).size === Object.keys(DEFAULT_BINDINGS).length;
    return {
      volume: Number.isFinite(stored.volume) ? THREE.MathUtils.clamp(stored.volume, 0, 1) : defaults.volume,
      sensitivity: Number.isFinite(stored.sensitivity)
        ? THREE.MathUtils.clamp(stored.sensitivity, 0.4, 2)
        : defaults.sensitivity,
      distinguishablePalette: stored.distinguishablePalette === true,
      reducedMotion: stored.reducedMotion === true,
      largeText: stored.largeText === true,
      bindings: validBindings ? bindings : { ...DEFAULT_BINDINGS },
    };
  } catch {
    return defaults;
  }
}

const settings = loadSettings();

const ui = {
  hud: document.querySelector('#hud'),
  menu: document.querySelector('#menu'),
  nightIntro: document.querySelector('#night-intro'),
  result: document.querySelector('#result'),
  pauseMenu: document.querySelector('#pause-menu'),
  pauseActions: document.querySelector('#pause-actions'),
  settings: document.querySelector('#settings'),
  leaderboard: document.querySelector('#leaderboard'),
  flames: document.querySelector('#flames'),
  carried: document.querySelector('#carried'),
  capacity: document.querySelector('#capacity'),
  lanterns: document.querySelector('#lantern-count'),
  lanternTotal: document.querySelector('#lantern-total'),
  score: document.querySelector('#score'),
  timer: document.querySelector('#timer'),
  moteBar: document.querySelector('#mote-bar'),
  dashCooldown: document.querySelector('#dash-cooldown'),
  pulseCooldown: document.querySelector('#pulse-cooldown'),
  depositProgress: document.querySelector('#deposit-progress'),
  interactionLabel: document.querySelector('#interaction-label'),
  interactKey: document.querySelector('#interact-key'),
  lanternArrow: document.querySelector('#lantern-arrow'),
  prompt: document.querySelector('#prompt'),
  toast: document.querySelector('#toast'),
  resultEyebrow: document.querySelector('#result-eyebrow'),
  resultTitle: document.querySelector('#result-title'),
  resultDetail: document.querySelector('#result-detail'),
  finalScore: document.querySelector('#final-score'),
  volume: document.querySelector('#volume'),
  volumeValue: document.querySelector('#volume-value'),
  sensitivity: document.querySelector('#sensitivity'),
  sensitivityValue: document.querySelector('#sensitivity-value'),
  distinguishablePalette: document.querySelector('#distinguishable-palette'),
  reducedMotion: document.querySelector('#reduced-motion'),
  largeText: document.querySelector('#large-text'),
  bindingFeedback: document.querySelector('#binding-feedback'),
  leaderboardList: document.querySelector('#leaderboard-list'),
  leaderboardEntry: document.querySelector('#leaderboard-entry'),
  leaderboardName: document.querySelector('#leaderboard-name'),
  leaderboardError: document.querySelector('#leaderboard-error'),
  windWarning: document.querySelector('#wind-warning'),
  fuelWarning: document.querySelector('#fuel-warning'),
  shadeArrow: document.querySelector('#shade-arrow'),
  nightEyebrow: document.querySelector('#night-eyebrow'),
  nightTitle: document.querySelector('#night-title'),
  nightStory: document.querySelector('#night-story'),
};

const keys = new Set();
const playerGroup = new THREE.Group();
const terrainGroup = new THREE.Group();
const lanternVisuals = new Map();
const moteVisuals = new Map();
const shadeVisuals = new Map();
const drifterVisuals = new Map();
const charmVisuals = new Map();
let ambientLight;
let leaderboardEntries = loadLocalLeaderboard();

function loadLocalLeaderboard() {
  try {
    return normalizeLeaderboard(JSON.parse(localStorage.getItem(LEADERBOARD_KEY) ?? '{"entries":[]}').entries);
  } catch {
    return [];
  }
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...options });
}

function mesh(geometry, meshMaterial, castShadow = true) {
  const item = new THREE.Mesh(geometry, meshMaterial);
  item.castShadow = castShadow;
  item.receiveShadow = true;
  return item;
}

const audio = {
  context: null,
  master: null,
  music: null,
  ensure() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
      this.music = this.context.createGain();
      this.music.gain.value = 0.08;
      this.music.connect(this.master);
      const drone = this.context.createOscillator();
      drone.type = 'sine';
      drone.frequency.value = 82;
      drone.connect(this.music);
      drone.start();
    }
    this.master.gain.value = settings.volume;
    this.context.resume?.();
  },
  cue(name) {
    if (settings.volume <= 0) return;
    this.ensure();
    const frequencies = {
      pickup: 740, lantern: 520, pulse: 220, hit: 110, jump: 340,
      dash: 460, win: 880, loss: 90, spawn: 150, countdown: 660,
    };
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = name === 'hit' || name === 'loss' ? 'sawtooth' : 'sine';
    oscillator.frequency.value = frequencies[name] ?? 440;
    gain.gain.setValueAtTime(0.13, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start();
    oscillator.stop(this.context.currentTime + 0.2);
  },
};

function buildWorld() {
  ambientLight = new THREE.HemisphereLight(0x9187d4, 0x24152f, 0.15);
  scene.add(ambientLight);
  scene.add(terrainGroup);
  const moon = new THREE.DirectionalLight(0xb8b3ff, 1.6);
  moon.position.set(-18, 28, 12);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -45;
  moon.shadow.camera.right = 45;
  moon.shadow.camera.top = 45;
  moon.shadow.camera.bottom = -45;
  scene.add(moon);

  const island = mesh(
    new THREE.CylinderGeometry(ISLAND_RADIUS + 1, ISLAND_RADIUS - 5, 3.5, 64),
    material(0x3b5544, { roughness: 1 }),
    false,
  );
  island.position.y = -1.8;
  terrainGroup.add(island);

  const shore = mesh(
    new THREE.TorusGeometry(ISLAND_RADIUS - 0.4, 0.65, 10, 96),
    material(0x71806c, { emissive: 0x26352c, emissiveIntensity: 0.25 }),
    false,
  );
  shore.rotation.x = Math.PI / 2;
  shore.position.y = -0.1;
  terrainGroup.add(shore);

  const sea = mesh(new THREE.CircleGeometry(130, 96), material(0x171a37, { roughness: 0.25, metalness: 0.15 }), false);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -3.55;
  terrainGroup.add(sea);

  const rng = mulberry32(2026);
  for (let index = 0; index < 34; index += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = 8 + rng() * 27;
    const tree = createTree(0.7 + rng() * 0.55);
    tree.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    tree.rotation.y = rng() * Math.PI;
    terrainGroup.add(tree);
  }

  for (let index = 0; index < 18; index += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = 5 + rng() * 31;
    const rock = mesh(new THREE.DodecahedronGeometry(0.4 + rng() * 0.7, 0), material(0x4b4a58));
    rock.position.set(Math.cos(angle) * radius, 0.2, Math.sin(angle) * radius);
    rock.scale.y = 0.55;
    terrainGroup.add(rock);
  }

  buildStars(rng);
  buildPlayer();
  scene.add(playerGroup);
}

function clearGroup(group) {
  while (group.children.length) group.remove(group.children[0]);
}

function addIsland(x, z, radius, topY = 0) {
  const island = mesh(
    new THREE.CylinderGeometry(radius, Math.max(1, radius - 5), 3.5 + topY, 64),
    material(0x3b5544, { roughness: 1 }),
    false,
  );
  island.position.set(x, topY / 2 - 1.75, z);
  terrainGroup.add(island);
}

function buildNightTerrain(night) {
  clearGroup(terrainGroup);
  const sea = mesh(new THREE.CircleGeometry(150, 96), material(0x171a37, { roughness: 0.25, metalness: 0.15 }), false);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -3.55;
  terrainGroup.add(sea);

  if (night === 1) {
    addIsland(0, 0, 40);
  } else if (night === 2) {
    addIsland(0, 0, 28);
    addIsland(70, 0, 28);
    const bridge = mesh(new THREE.BoxGeometry(18, 0.35, 4), material(0x9a6b3f), false);
    bridge.position.set(35, -0.16, 0);
    terrainGroup.add(bridge);
  } else {
    addIsland(0, 0, 45);
    const tier1 = mesh(new THREE.RingGeometry(12, 24, 64, 1, Math.PI, Math.PI), material(0x496653), false);
    tier1.rotation.x = -Math.PI / 2;
    tier1.position.y = 3;
    terrainGroup.add(tier1);
    addIsland(0, 0, 8, 6);
    const tower = mesh(new THREE.CylinderGeometry(2, 2, 8, 24), material(0x544b62), false);
    tower.position.y = 10;
    terrainGroup.add(tower);
  }

  const config = simulation?.nightConfig;
  if (config) {
    for (const pad of config.terrain.launchPads) {
      const visual = mesh(new THREE.CylinderGeometry(1, 1, 0.15, 24), material(0xc95c45, { emissive: 0x6e251d, emissiveIntensity: 0.7 }), false);
      visual.position.set(pad.pos[0], pad.pos[1] + 0.08, pad.pos[2]);
      terrainGroup.add(visual);
    }
  }
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createTree(scale) {
  const group = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.18, 0.3, 2.1, 7), material(0x4f3026));
  trunk.position.y = 1.05;
  group.add(trunk);
  for (let layer = 0; layer < 3; layer += 1) {
    const crown = mesh(new THREE.ConeGeometry(1.35 - layer * 0.22, 2.4, 8), material(0x263e39));
    crown.position.y = 2.15 + layer * 0.8;
    group.add(crown);
  }
  group.scale.setScalar(scale);
  return group;
}

function buildStars(rng) {
  const positions = [];
  for (let index = 0; index < 500; index += 1) {
    const angle = rng() * Math.PI * 2;
    const height = 18 + rng() * 60;
    const radius = 55 + rng() * 75;
    positions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xfff2c7, size: 0.35, sizeAttenuation: true })));
}

function buildPlayer() {
  const robe = mesh(new THREE.CapsuleGeometry(0.55, 1.15, 6, 10), material(0xd66d4b));
  robe.position.y = 1.15;
  playerGroup.add(robe);

  const head = mesh(new THREE.SphereGeometry(0.42, 16, 12), material(0xf0bc83));
  head.position.y = 2.18;
  playerGroup.add(head);

  const hat = mesh(new THREE.ConeGeometry(0.95, 0.48, 24), material(0xd8b46a));
  hat.position.y = 2.63;
  playerGroup.add(hat);

  const hatTop = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 6), material(0x6e452c));
  hatTop.position.y = 2.96;
  playerGroup.add(hatTop);

  const smallLantern = mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.27, 8),
    material(0xffa53b, { emissive: 0xff6f20, emissiveIntensity: 2 }),
  );
  smallLantern.position.set(0.72, 2.35, 0);
  playerGroup.add(smallLantern);
  const glow = new THREE.PointLight(0xff9f45, 2.2, 7, 2);
  glow.position.copy(smallLantern.position);
  playerGroup.add(glow);
}

function createLanternVisual(lantern) {
  const group = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.65, 0.85, 0.45, 10), material(0x49352f));
  base.position.y = 0.22;
  group.add(base);
  const post = mesh(new THREE.CylinderGeometry(0.18, 0.24, 3.8, 10), material(0x594035));
  post.position.y = 2.15;
  group.add(post);
  const roof = mesh(new THREE.ConeGeometry(1.15, 0.65, 8), material(0x7e3f36));
  roof.position.y = 4.55;
  group.add(roof);
  const lampMaterial = material(0x57435c, { emissive: 0x1b1025, emissiveIntensity: 0.4 });
  const lamp = mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.5, 12), lampMaterial);
  lamp.position.y = 3.7;
  group.add(lamp);
  const tearMaterial = new THREE.MeshBasicMaterial({ color: 0x211622 });
  const tears = [];
  for (const rotation of [-0.65, 0.65]) {
    const tear = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.065, 0.035), tearMaterial);
    tear.position.set(0, 3.7, 0.705);
    tear.rotation.z = rotation;
    group.add(tear);
    tears.push(tear);
  }
  const light = new THREE.PointLight(0xffa43e, 0, 13, 1.5);
  light.position.y = 3.7;
  light.castShadow = false;
  group.add(light);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(contract.tuning.safe_radius - 0.08, contract.tuning.safe_radius, 64),
    new THREE.MeshBasicMaterial({ color: 0xffc45c, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);
  const fuelBar = new THREE.Group();
  fuelBar.position.set(0, 5.25, 0);
  const fuelBack = new THREE.Mesh(
    new THREE.BoxGeometry(1.75, 0.22, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x21162e }),
  );
  const fuelFill = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.12, 0.075),
    new THREE.MeshBasicMaterial({ color: 0xffcb62 }),
  );
  fuelFill.position.z = 0.04;
  fuelBar.add(fuelBack, fuelFill);
  group.add(fuelBar);
  group.userData = { lampMaterial, light, ring, tears, fuelBar, fuelFill, wasLit: false };
  group.position.set(...lantern.pos);
  scene.add(group);
  return group;
}

function createMoteVisual(mote) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe27d }),
  );
  group.add(core);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffb73d, transparent: true, opacity: 0.16, depthWrite: false }),
  );
  group.add(halo);
  group.position.set(mote.pos[0], 0.75, mote.pos[2]);
  group.userData.phase = mote.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.13;
  scene.add(group);
  return group;
}

function createShadeVisual(shade) {
  const group = new THREE.Group();
  const bodyMaterial = material(0x181020, { emissive: 0x2e0b4c, emissiveIntensity: 0.8, roughness: 0.9 });
  const body = mesh(new THREE.SphereGeometry(0.78, 14, 10), bodyMaterial);
  body.scale.y = 1.25;
  body.position.y = 0.85;
  group.add(body);
  const outlineMaterial = new THREE.MeshBasicMaterial({ color: 0x7a3cff, side: THREE.BackSide });
  const outline = new THREE.Mesh(new THREE.SphereGeometry(0.78, 14, 10), outlineMaterial);
  outline.scale.set(1.08, 1.35, 1.08);
  outline.position.y = 0.85;
  group.add(outline);
  const eyeMaterials = [];
  for (const side of [-1, 1]) {
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x7a3cff });
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), eyeMaterial);
    eye.position.set(side * 0.2, 1.02, 0.69);
    group.add(eye);
    eyeMaterials.push(eyeMaterial);
  }
  group.userData = { bodyMaterial, outlineMaterial, eyeMaterials };
  group.position.set(...shade.pos);
  scene.add(group);
  applyShadePalette(group);
  return group;
}

function applyShadePalette(visual) {
  const accent = settings.distinguishablePalette ? 0x00b3ff : 0x7a3cff;
  visual.userData.outlineMaterial?.color.setHex(accent);
  for (const eyeMaterial of visual.userData.eyeMaterials ?? []) eyeMaterial.color.setHex(accent);
}

function applyAccessibilityPalette() {
  document.body.classList.toggle('distinguishable-palette', settings.distinguishablePalette);
  document.body.classList.toggle('reduced-motion', settings.reducedMotion);
  document.body.classList.toggle('large-text', settings.largeText);
  document.documentElement.classList.toggle('large-text', settings.largeText);
  for (const visual of shadeVisuals.values()) applyShadePalette(visual);
}

function renderLeaderboard() {
  if (!leaderboardEntries.length) {
    const empty = document.createElement('li');
    empty.className = 'leaderboard-empty';
    empty.textContent = 'Chưa có người giữ đèn nào ghi danh.';
    ui.leaderboardList.replaceChildren(empty);
    return;
  }
  ui.leaderboardList.replaceChildren(...leaderboardEntries.map((entry) => {
    const item = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = entry.name;
    const score = document.createElement('span');
    score.textContent = `${entry.score.toLocaleString('vi-VN')} điểm · ${entry.nights_won}/3 Đêm`;
    const date = document.createElement('time');
    date.dateTime = entry.achieved_at;
    date.textContent = new Date(entry.achieved_at).toLocaleString('vi-VN');
    item.append(name, score, date);
    return item;
  }));
}

async function persistLeaderboard() {
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify({ entries: leaderboardEntries }));
  try {
    await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: leaderboardEntries }),
    });
  } catch {
    // Static release builds keep the same data in localStorage.
  }
}

async function hydrateLeaderboard() {
  try {
    const response = await fetch('/api/leaderboard');
    if (!response.ok) return;
    const stored = await response.json();
    leaderboardEntries = normalizeLeaderboard([...leaderboardEntries, ...(stored.entries ?? [])]);
    await persistLeaderboard();
    renderLeaderboard();
  } catch {
    // Offline/static play continues with localStorage.
  }
}

function createDrifterVisual(drifter) {
  const ribbon = mesh(
    new THREE.TorusKnotGeometry(0.45, 0.12, 48, 6, 2, 3),
    material(0x78949b, { emissive: 0x294f59, emissiveIntensity: 1.1 }),
  );
  ribbon.scale.set(1.4, 0.65, 0.65);
  ribbon.position.set(...drifter.pos);
  ribbon.position.y += 1.2;
  scene.add(ribbon);
  return ribbon;
}

function createCharmVisual(charm) {
  const charmMaterial = material(0xc8322e, { emissive: 0x8f1c18, emissiveIntensity: 1.2 });
  const visual = mesh(new THREE.BoxGeometry(0.55, 0.8, 0.08), charmMaterial);
  visual.position.set(...charm.pos);
  visual.position.y += 1;
  scene.add(visual);
  return visual;
}

function resetGame() {
  audio.ensure();
  simulation = new Simulation({
    seed: SESSION_SEED + currentNight - 1,
    tuning: contract.tuning,
    contractVersion: contract.contract_version,
    night: currentNight,
  });
  for (const visual of [
    ...lanternVisuals.values(), ...moteVisuals.values(), ...shadeVisuals.values(),
    ...drifterVisuals.values(), ...charmVisuals.values(),
  ]) scene.remove(visual);
  lanternVisuals.clear();
  moteVisuals.clear();
  shadeVisuals.clear();
  drifterVisuals.clear();
  charmVisuals.clear();
  buildNightTerrain(currentNight);
  for (const lantern of simulation.lanterns) lanternVisuals.set(lantern.id, createLanternVisual(lantern));
  syncWorld(benchmarkCameraStart);
  cameraYaw = 0;
  accumulator = 0;
  ui.result.classList.add('hidden');
  ui.pauseMenu.classList.add('hidden');
  ui.settings.classList.add('hidden');
  ui.pauseActions.classList.remove('hidden');
  ui.menu.classList.add('hidden');
  ui.nightIntro.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  playing = true;
  pauseRequested = false;
  previousShadeCount = 0;
  lastCountdownSecond = null;
}

function benchmarkPoints(count, seed, maxRadius) {
  const rng = new SeededRng(seed);
  const rotation = rng.range(0, Math.PI * 2);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, index) => {
    const radius = Math.sqrt((index + 0.5) / count) * maxRadius;
    const angle = rotation + index * goldenAngle;
    return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
  });
}

function startBenchmark(seed) {
  benchmarkMode = true;
  currentNight = 1;
  const shadePositions = benchmarkPoints(200, seed, 36);
  const motePositions = benchmarkPoints(100, seed ^ 0x5f3759df, 34);
  simulation = new Simulation({
    seed,
    tuning: contract.tuning,
    contractVersion: contract.contract_version,
    night: 1,
    mode: 'benchmark',
    scenario: {
      player: { pos: [0, 0, 0] },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      charms: [],
      motes: motePositions,
      shades: shadePositions.map((pos, index) => ({ id: `S${index + 1}`, pos, state: 'wander' })),
      lanterns: [
        { id: 'L1', lit: true, fuel: 100, ever_lit: true },
        { id: 'L2', lit: true, fuel: 100, ever_lit: true },
        { id: 'L3', lit: true, fuel: 100, ever_lit: true },
      ],
    },
  });
  buildNightTerrain(1);
  for (const lantern of simulation.lanterns) lanternVisuals.set(lantern.id, createLanternVisual(lantern));
  benchmarkCameraStart = clock.elapsedTime;
  accumulator = 0;
  playing = true;
  ui.menu.classList.add('hidden');
  ui.nightIntro.classList.add('hidden');
  ui.result.classList.add('hidden');
  ui.pauseMenu.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  syncWorld(0);
}

function showNightIntro(night) {
  currentNight = night;
  const story = NIGHT_STORIES[night];
  ui.nightEyebrow.textContent = `Đêm ${night} / 3`;
  ui.nightTitle.textContent = story.name;
  ui.nightStory.textContent = story.words;
  ui.menu.classList.add('hidden');
  ui.result.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.nightIntro.classList.remove('hidden');
}

function currentInput() {
  // The camera looks along +forward, whose screen-right vector is -local X.
  // Invert only the keyboard mapping; the core X/Yaw formula follows the Test Contract.
  const x = (keys.has(settings.bindings.moveLeft) ? 1 : 0) - (keys.has(settings.bindings.moveRight) ? 1 : 0);
  const z = (keys.has(settings.bindings.moveForward) ? 1 : 0) - (keys.has(settings.bindings.moveBackward) ? 1 : 0);
  return {
    move: [x, z],
    cam_yaw_deg: THREE.MathUtils.radToDeg(cameraYaw),
    jump: keys.has(settings.bindings.jump),
    interact: keys.has(settings.bindings.interact),
    pulse: keys.has(settings.bindings.pulse),
    dash: keys.has(settings.bindings.dash),
    pause: keys.has(settings.bindings.pause) || pauseRequested,
  };
}

function handleEvents(events) {
  for (const event of events) {
    if (event.name === 'mote_picked') { audio.cue('pickup'); showToast(`Đom đóm ${event.data.carried}/${simulation.capacity}`); }
    if (event.name === 'lantern_lit') { audio.cue('lantern'); showToast(`${event.data.lantern_id} đã bừng sáng!`); }
    if (event.name === 'refuel') { audio.cue('lantern'); showToast(`${event.data.lantern_id} · dầu ${event.data.fuel.toFixed(1)}/100`); }
    if (event.name === 'lantern_out') showToast(`⚠ ${event.data.lantern_id} đã cạn dầu!`);
    if (event.name === 'pulse') { audio.cue('pulse'); showToast(event.data.stunned_ids.length ? `Xua ${event.data.stunned_ids.length} Bóng Mực` : 'Không có Bóng Mực trong tầm'); }
    if (event.name === 'dash') audio.cue('dash');
    if (event.name === 'charm_picked') { audio.cue('pickup'); showToast('Bùa Gió thức tỉnh · chạy nhanh, lướt không hồi'); }
    if (event.name === 'drifter_steal') showToast(`Gió Lạc cướp ${event.data.amount} đom đóm`);
    if (event.name === 'drifter_drop') showToast(`Gió Lạc trả lại ${event.data.amount} đom đóm`);
    if (event.name === 'player_hit') {
      audio.cue('hit');
      showToast(event.data.by === 'fall' ? `Rơi khỏi đảo · mất ${event.data.lost} đom đóm` : `Bị Bóng Mực chạm · rơi ${event.data.dropped} đom đóm`);
    }
    if (event.name === 'paused') {
      document.exitPointerLock?.();
      ui.pauseMenu.classList.remove('hidden');
    }
    if (event.name === 'resumed') {
      ui.pauseMenu.classList.add('hidden');
      ui.settings.classList.add('hidden');
      ui.pauseActions.classList.remove('hidden');
      if (requestPointerLockAfterResume) canvas.requestPointerLock?.();
      requestPointerLockAfterResume = false;
    }
    if (event.name === 'game_over') showResult(event.data.result, event.data.reason);
  }
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => ui.toast.classList.add('hidden'), 1300);
}

function showResult(result, reason) {
  playing = false;
  document.exitPointerLock?.();
  if (result === 'won') {
    totalScore += simulation.score;
    nightsWon += 1;
    audio.cue('win');
  } else {
    audio.cue('loss');
  }
  const finalDawn = result === 'won' && currentNight === 3;
  ui.resultEyebrow.textContent = finalDawn ? 'Bình Minh' : result === 'won' ? `Hoàn thành Đêm ${currentNight}` : 'Sương đen chiến thắng';
  ui.resultTitle.textContent = finalDawn ? 'Ánh sáng đã trở về!' : result === 'won' ? 'Đảo đã sáng!' : 'Đêm chưa kết thúc';
  const reasons = {
    dawn_survived: 'Mây còn sống và giữ đủ ánh đèn tới bình minh.',
    dawn: 'Bình minh đến nhưng số đèn còn sáng chưa đủ.',
    no_flames: 'Ngọn lửa nhỏ của Mây đã tắt.',
  };
  ui.resultDetail.textContent = reasons[reason] ?? '';
  ui.finalScore.textContent = finalDawn
    ? `Tổng điểm ba Đêm: ${totalScore.toLocaleString('vi-VN')}`
    : result === 'lost'
      ? `Tổng điểm các Đêm đã thắng: ${totalScore.toLocaleString('vi-VN')}`
      : `${simulation.score.toLocaleString('vi-VN')} điểm`;
  ui.leaderboardEntry.classList.toggle('hidden', !(finalDawn || result === 'lost'));
  ui.leaderboardName.value = '';
  ui.leaderboardError.textContent = '';
  const resultButton = document.querySelector('#restart');
  resultButton.dataset.result = result;
  resultButton.textContent = finalDawn ? 'Về menu chính' : result === 'won' ? `Sang Đêm ${currentNight + 1}` : `Chơi lại Đêm ${currentNight}`;
  ui.result.classList.remove('hidden');
}

function syncWorld(elapsed) {
  playerGroup.position.set(...simulation.player.pos);
  const move = currentInput().move;
  if (move[0] || move[1]) {
    const angle = Math.atan2(move[0], move[1]) + cameraYaw;
    playerGroup.rotation.y = angle;
  }

  for (const lantern of simulation.lanterns) {
    const visual = lanternVisuals.get(lantern.id);
    if (!visual) continue;
    visual.position.set(...lantern.pos);
    const { lampMaterial, light, ring, tears, fuelBar, fuelFill } = visual.userData;
    const lowFuel = lantern.lit && lantern.fuel < contract.tuning.low_fuel_threshold;
    const blinkOn = !lowFuel || settings.reducedMotion || Math.sin(elapsed * Math.PI * 2) >= 0;
    lampMaterial.color.setHex(lantern.lit ? 0xffb648 : 0x57435c);
    lampMaterial.emissive.setHex(lantern.lit ? 0xff6c18 : 0x1b1025);
    lampMaterial.emissiveIntensity = lantern.lit ? (blinkOn ? 2.8 : 0.45) : 0.35;
    light.intensity = lantern.lit ? (blinkOn ? 4.5 : 0.35) : 0;
    ring.material.opacity = lantern.lit && lantern.fuel >= contract.tuning.low_fuel_threshold ? 0.11 : 0;
    visual.scale.setScalar(lantern.lit ? 1 : 0.8);
    for (const tear of tears) tear.visible = !lantern.lit;
    fuelBar.visible = lantern.lit && blinkOn;
    const fuelRatio = THREE.MathUtils.clamp(lantern.fuel / contract.tuning.fuel_max, 0, 1);
    fuelFill.scale.x = Math.max(0.001, fuelRatio);
    fuelFill.position.x = -0.8 * (1 - fuelRatio);
    fuelFill.material.color.setHex(lowFuel ? (settings.distinguishablePalette ? 0xffffff : 0xff5a5f) : 0xffcb62);
  }

  const currentMotes = new Set(simulation.motes.map((mote) => mote.id));
  for (const [id, visual] of moteVisuals) {
    if (!currentMotes.has(id)) {
      scene.remove(visual);
      moteVisuals.delete(id);
    }
  }
  for (const mote of simulation.motes) {
    let visual = moteVisuals.get(mote.id);
    if (!visual) {
      visual = createMoteVisual(mote);
      moteVisuals.set(mote.id, visual);
    }
    visual.position.x = mote.pos[0];
    visual.position.z = mote.pos[2];
    visual.position.y = 0.75 + Math.sin(elapsed * 2.6 + visual.userData.phase) * 0.2;
    visual.rotation.y += 0.025;
  }

  const currentShades = new Set(simulation.shades.map((shade) => shade.id));
  for (const [id, visual] of shadeVisuals) {
    if (!currentShades.has(id)) {
      scene.remove(visual);
      shadeVisuals.delete(id);
    }
  }
  for (const shade of simulation.shades) {
    let visual = shadeVisuals.get(shade.id);
    if (!visual) {
      visual = createShadeVisual(shade);
      shadeVisuals.set(shade.id, visual);
    }
    visual.position.set(shade.pos[0], shade.pos[1] + Math.sin(elapsed * 2.1 + shade.pos[0]) * 0.12, shade.pos[2]);
    visual.userData.bodyMaterial.emissive.setHex(shade.state === 'stunned' ? 0x7354b8 : 0x2e0b4c);
  }

  const currentDrifters = new Set(simulation.drifters.map((drifter) => drifter.id));
  for (const [id, visual] of drifterVisuals) {
    if (!currentDrifters.has(id)) { scene.remove(visual); drifterVisuals.delete(id); }
  }
  for (const drifter of simulation.drifters) {
    let visual = drifterVisuals.get(drifter.id);
    if (!visual) { visual = createDrifterVisual(drifter); drifterVisuals.set(drifter.id, visual); }
    visual.position.set(drifter.pos[0], drifter.pos[1] + 1.2, drifter.pos[2]);
    visual.rotation.y += 0.06;
  }

  for (const charm of simulation.charms) {
    let visual = charmVisuals.get(charm.id);
    if (!visual) { visual = createCharmVisual(charm); charmVisuals.set(charm.id, visual); }
    visual.visible = charm.available;
    visual.position.set(charm.pos[0], charm.pos[1] + 1 + Math.sin(elapsed * 2.4) * 0.15, charm.pos[2]);
    visual.rotation.y += 0.02;
  }

  if (!benchmarkMode && simulation.shades.length > previousShadeCount) {
    audio.cue('spawn');
    showToast('⚠ Bóng Mực vừa xuất hiện');
    shadeAlertShadeId = simulation.shades.at(-1)?.id ?? null;
    shadeAlertUntil = elapsed + 3;
  }
  previousShadeCount = simulation.shades.length;

  const litCount = simulation.lanterns.filter((lantern) => lantern.lit).length;
  ambientLight.intensity = 0.15 + 0.55 * (litCount / simulation.lanterns.length);
  renderer.toneMappingExposure = 1.16 + litCount * 0.06;
  updateHud(litCount);
  updateCamera(elapsed);
  updateShadeAlert(elapsed);
}

function updateShadeAlert(elapsed) {
  const shade = simulation.shades.find((item) => item.id === shadeAlertShadeId);
  if (!shade || elapsed >= shadeAlertUntil) {
    ui.shadeArrow.classList.add('hidden');
    return;
  }
  const projected = new THREE.Vector3(...shade.pos).project(camera);
  const onScreen = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 0.88 && Math.abs(projected.y) < 0.82;
  ui.shadeArrow.classList.toggle('hidden', onScreen);
  if (!onScreen) {
    const angle = Math.atan2(-projected.y, projected.x);
    ui.shadeArrow.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
  }
}

function updateHud(litCount) {
  ui.flames.textContent = '🔥'.repeat(simulation.player.flames) || '○';
  ui.carried.textContent = simulation.player.carried;
  ui.capacity.textContent = simulation.capacity;
  ui.lanterns.textContent = litCount;
  ui.lanternTotal.textContent = simulation.lanterns.length;
  ui.score.textContent = simulation.score.toLocaleString('vi-VN');
  const seconds = Math.ceil(simulation.timeLeftS);
  const timeText = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  ui.timer.textContent = seconds <= 10 || (settings.distinguishablePalette && seconds <= 30) ? `⚠ ${timeText}` : timeText;
  ui.timer.classList.toggle('urgent', seconds <= 30);
  if (seconds <= 10 && seconds !== lastCountdownSecond) {
    audio.cue('countdown');
    lastCountdownSecond = seconds;
  }
  ui.windWarning.classList.toggle('hidden', !simulation.wind.warning);
  const lowFuelLanterns = simulation.lanterns.filter((lantern) =>
    lantern.lit && lantern.fuel < contract.tuning.low_fuel_threshold
  );
  ui.fuelWarning.classList.toggle('hidden', lowFuelLanterns.length === 0);
  if (lowFuelLanterns.length) {
    ui.fuelWarning.textContent = `⚠ Sắp cạn dầu: ${lowFuelLanterns.map((lantern) => lantern.id).join(', ')}`;
  }

  if (ui.moteBar.children.length !== simulation.capacity) {
    ui.moteBar.replaceChildren(...Array.from({ length: simulation.capacity }, () => document.createElement('i')));
  }
  [...ui.moteBar.children].forEach((slot, index) => slot.classList.toggle('filled', index < simulation.player.carried));

  const dashSeconds = simulation.player.dashCooldownTicks / TICK_RATE;
  const pulseSeconds = simulation.player.pulseCooldownTicks / TICK_RATE;
  const dashKey = formatKey(settings.bindings.dash);
  const pulseKey = formatKey(settings.bindings.pulse);
  ui.dashCooldown.textContent = dashSeconds > 0 ? `${dashKey} Lướt · ${dashSeconds.toFixed(1)}s` : `${dashKey} Lướt · Sẵn sàng`;
  ui.pulseCooldown.textContent = pulseSeconds > 0 ? `${pulseKey} Tỏa sáng · ${pulseSeconds.toFixed(1)}s` : `${pulseKey} Tỏa sáng · Sẵn sàng`;
  ui.interactKey.textContent = formatKey(settings.bindings.interact);

  const receivable = simulation.lanterns
    .filter((lantern) => !lantern.lit || lantern.fuel < contract.tuning.fuel_max)
    .sort((a, b) => Math.hypot(a.pos[0] - simulation.player.pos[0], a.pos[2] - simulation.player.pos[2])
      - Math.hypot(b.pos[0] - simulation.player.pos[0], b.pos[2] - simulation.player.pos[2]));
  const nearLantern = receivable.find((lantern) => Math.hypot(
    lantern.pos[0] - simulation.player.pos[0],
    lantern.pos[2] - simulation.player.pos[2],
  ) <= contract.tuning.interact_radius);
  ui.prompt.classList.toggle('hidden', !nearLantern || simulation.player.carried === 0);
  if (nearLantern?.lit) {
    ui.interactionLabel.textContent = 'Châm dầu';
    ui.depositProgress.textContent = `${nearLantern.fuel.toFixed(1)}/${contract.tuning.fuel_max}`;
  } else if (nearLantern) {
    const cost = nearLantern.everLit ? contract.tuning.relight_cost : contract.tuning.lantern_cost;
    ui.interactionLabel.textContent = nearLantern.everLit ? 'Thắp lại' : 'Nạp ánh sáng';
    ui.depositProgress.textContent = `${nearLantern.deposited}/${cost}`;
  }

  const target = receivable[0];
  if (!target) {
    ui.lanternArrow.classList.add('hidden');
  } else {
    const projected = new THREE.Vector3(...target.pos).project(camera);
    const onScreen = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 0.9 && Math.abs(projected.y) < 0.85;
    ui.lanternArrow.classList.toggle('hidden', onScreen);
    if (!onScreen) {
      const angle = Math.atan2(-projected.y, projected.x);
      ui.lanternArrow.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
    }
  }
}

function updateCamera(elapsed = 0) {
  if (benchmarkMode) {
    const angle = ((elapsed - benchmarkCameraStart) / 15) * Math.PI * 2;
    camera.position.set(Math.cos(angle) * 30, 15, Math.sin(angle) * 30);
    camera.lookAt(0, 0, 0);
    return;
  }
  const player = new THREE.Vector3(...simulation.player.pos);
  const forward = new THREE.Vector3(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
  const distance = 9.5;
  const desired = player.clone().addScaledVector(forward, -distance);
  desired.y += 3.6 + Math.sin(cameraPitch) * 5;
  camera.position.lerp(desired, 0.14);
  camera.lookAt(player.x, player.y + 1.5, player.z);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.elapsedTime;
  if (playing) {
    accumulator += delta;
    while (accumulator >= 1 / TICK_RATE && simulation.state === 'playing') {
      const input = currentInput();
      handleEvents(simulation.step(input));
      pauseRequested = false;
      accumulator -= 1 / TICK_RATE;
    }
  }
  if (simulation) syncWorld(elapsed);
  renderer.render(scene, camera);
  if (benchmarkMode && !document.body.dataset.benchmarkFirstFrameEpoch) {
    document.body.dataset.benchmarkFirstFrameEpoch = String(Date.now());
  }
}

window.addEventListener('keydown', (event) => {
  if (rebindingAction) {
    event.preventDefault();
    const conflict = Object.entries(settings.bindings).find(([action, code]) => action !== rebindingAction && code === event.code);
    if (conflict) {
      ui.bindingFeedback.textContent = `Phím ${formatKey(event.code)} đã được dùng. Hãy chọn phím khác.`;
      return;
    }
    settings.bindings[rebindingAction] = event.code;
    rebindingAction = null;
    ui.bindingFeedback.textContent = 'Đã lưu phím mới.';
    syncSettingsUi();
    persistSettings();
    return;
  }
  if (Object.values(settings.bindings).includes(event.code)) event.preventDefault();
  if (event.code === settings.bindings.jump && !event.repeat && playing && !simulation.paused) audio.cue('jump');
  keys.add(event.code);
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas || !playing || simulation.paused) return;
  cameraYaw -= event.movementX * 0.0025 * settings.sensitivity;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch - event.movementY * 0.0015 * settings.sensitivity, 0.12, 0.75);
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
canvas.addEventListener('click', () => {
  if (playing && !simulation.paused) canvas.requestPointerLock?.();
});
document.querySelector('#start').addEventListener('click', () => {
  totalScore = 0;
  nightsWon = 0;
  showNightIntro(1);
});
document.querySelector('#begin-night').addEventListener('click', resetGame);
document.querySelector('#restart').addEventListener('click', (event) => {
  if (event.currentTarget.dataset.result === 'won') {
    if (currentNight < 3) showNightIntro(currentNight + 1);
    else {
      totalScore = 0;
      nightsWon = 0;
      currentNight = 1;
      ui.result.classList.add('hidden');
      ui.menu.classList.remove('hidden');
    }
  } else {
    resetGame();
  }
});
document.querySelector('#continue').addEventListener('click', () => {
  pauseRequested = true;
  requestPointerLockAfterResume = true;
});
document.querySelector('#retry-night').addEventListener('click', resetGame);
document.querySelector('#open-settings').addEventListener('click', () => {
  settingsReturn = 'pause';
  ui.pauseMenu.classList.add('hidden');
  ui.settings.classList.remove('hidden');
});
document.querySelector('#close-settings').addEventListener('click', () => {
  ui.settings.classList.add('hidden');
  if (settingsReturn === 'pause') ui.pauseMenu.classList.remove('hidden');
  else ui.menu.classList.remove('hidden');
});
document.querySelector('#back-to-menu').addEventListener('click', () => {
  playing = false;
  keys.clear();
  pauseRequested = false;
  ui.pauseMenu.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.menu.classList.remove('hidden');
  currentNight = 1;
  totalScore = 0;
  nightsWon = 0;
});

document.querySelector('#open-main-settings').addEventListener('click', () => {
  settingsReturn = 'menu';
  ui.menu.classList.add('hidden');
  ui.settings.classList.remove('hidden');
});
document.querySelector('#open-leaderboard').addEventListener('click', () => {
  renderLeaderboard();
  ui.menu.classList.add('hidden');
  ui.leaderboard.classList.remove('hidden');
});
document.querySelector('#close-leaderboard').addEventListener('click', () => {
  ui.leaderboard.classList.add('hidden');
  ui.menu.classList.remove('hidden');
});

ui.leaderboardEntry.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = ui.leaderboardName.value.trim();
  try {
    leaderboardEntries = addLeaderboardEntry(leaderboardEntries, {
      name,
      score: totalScore,
      nights_won: nightsWon,
      achieved_at: new Date().toISOString(),
      seed: SESSION_SEED,
    });
    await persistLeaderboard();
    renderLeaderboard();
    ui.leaderboardEntry.classList.add('hidden');
    showToast('Đã lưu điểm vào Top 10 cục bộ');
  } catch {
    ui.leaderboardError.textContent = 'Tên phải có 3–12 ký tự A–Z, 0–9 hoặc dấu gạch dưới.';
  }
});

function persistSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function syncSettingsUi() {
  ui.volume.value = String(Math.round(settings.volume * 100));
  ui.volumeValue.value = `${Math.round(settings.volume * 100)}%`;
  ui.sensitivity.value = String(Math.round(settings.sensitivity * 100));
  ui.sensitivityValue.value = `${Math.round(settings.sensitivity * 100)}%`;
  ui.distinguishablePalette.checked = settings.distinguishablePalette;
  ui.reducedMotion.checked = settings.reducedMotion;
  ui.largeText.checked = settings.largeText;
  for (const button of document.querySelectorAll('[data-bind-action]')) {
    button.textContent = formatKey(settings.bindings[button.dataset.bindAction]);
  }
}

function formatKey(code) {
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace('Space', 'Space')
    .replace('ShiftLeft', 'Shift trái')
    .replace('ShiftRight', 'Shift phải');
}

ui.volume.addEventListener('input', () => {
  settings.volume = Number(ui.volume.value) / 100;
  syncSettingsUi();
  persistSettings();
  if (audio.master) audio.master.gain.value = settings.volume;
});
ui.sensitivity.addEventListener('input', () => {
  settings.sensitivity = Number(ui.sensitivity.value) / 100;
  syncSettingsUi();
  persistSettings();
});
ui.distinguishablePalette.addEventListener('change', () => {
  settings.distinguishablePalette = ui.distinguishablePalette.checked;
  applyAccessibilityPalette();
  persistSettings();
});
ui.reducedMotion.addEventListener('change', () => {
  settings.reducedMotion = ui.reducedMotion.checked;
  applyAccessibilityPalette();
  persistSettings();
});
ui.largeText.addEventListener('change', () => {
  settings.largeText = ui.largeText.checked;
  applyAccessibilityPalette();
  persistSettings();
});
for (const button of document.querySelectorAll('[data-bind-action]')) {
  button.addEventListener('click', () => {
    rebindingAction = button.dataset.bindAction;
    ui.bindingFeedback.textContent = `Nhấn phím mới cho “${button.previousElementSibling.textContent}”…`;
    button.textContent = '…';
  });
}
document.querySelector('#restore-bindings').addEventListener('click', () => {
  settings.bindings = { ...DEFAULT_BINDINGS };
  rebindingAction = null;
  ui.bindingFeedback.textContent = 'Đã khôi phục phím mặc định.';
  syncSettingsUi();
  persistSettings();
});

buildWorld();
syncSettingsUi();
applyAccessibilityPalette();
renderLeaderboard();
hydrateLeaderboard();
const searchParams = new URLSearchParams(window.location.search);
if (searchParams.has('benchmark')) {
  startBenchmark(Number(searchParams.get('seed') ?? 42));
} else if (searchParams.has('autostart')) {
  resetGame();
} else {
  simulation = new Simulation({
    seed: 2026,
    tuning: contract.tuning,
    contractVersion: contract.contract_version,
    night: 1,
  });
  buildNightTerrain(1);
  for (const lantern of simulation.lanterns) lanternVisuals.set(lantern.id, createLanternVisual(lantern));
  syncWorld(0);
}

if (searchParams.has('benchmark')) {
  const durationMs = Number(searchParams.get('duration') ?? 30) * 1000;
  const warmupMs = 3000;
  const frameTimes = [];
  let firstTimestamp = null;
  let previousTimestamp = null;
  const sampleBenchmark = (timestamp) => {
    if (firstTimestamp === null) {
      firstTimestamp = timestamp;
      previousTimestamp = timestamp;
    }
    const elapsed = timestamp - firstTimestamp;
    if (elapsed >= warmupMs && elapsed < warmupMs + durationMs) {
      frameTimes.push(timestamp - previousTimestamp);
    }
    previousTimestamp = timestamp;
    if (elapsed < warmupMs + durationMs) {
      requestAnimationFrame(sampleBenchmark);
      return;
    }
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const frames = frameTimes.length;
    const totalMs = frameTimes.reduce((sum, value) => sum + value, 0);
    const slowCount = Math.max(1, Math.ceil(frames * 0.01));
    const slowest = sorted.slice(-slowCount);
    const slowAverage = slowest.reduce((sum, value) => sum + value, 0) / slowest.length;
    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const result = {
      avg_fps: Math.round(((1000 * frames) / totalMs) * 10) / 10,
      p1_low_fps: Math.round((1000 / slowAverage) * 10) / 10,
      frame_ms_p95: Math.round(sorted[Math.max(0, Math.ceil(frames * 0.95) - 1)] * 10) / 10,
      frames,
      first_frame_epoch_ms: Number(document.body.dataset.benchmarkFirstFrameEpoch),
      renderer: `Three.js r${THREE.REVISION} WebGLRenderer · ${gpu}`,
      os: navigator.userAgentData?.platform ?? navigator.platform,
    };
    document.querySelector('#benchmark-result').value = JSON.stringify(result);
    document.body.dataset.benchmarkResult = JSON.stringify(result);
    document.body.dataset.benchmarkFps = String(result.avg_fps);
  };
  requestAnimationFrame(sampleBenchmark);
}
animate();

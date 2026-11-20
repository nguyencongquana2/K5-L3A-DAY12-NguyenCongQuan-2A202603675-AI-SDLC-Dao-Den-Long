import * as THREE from 'three';
import contract from '../../../game.contract.json';
import { ISLAND_RADIUS, Simulation, TICK_RATE } from '../core/simulation.js';
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

const NIGHT_STORIES = {
  1: { name: 'Đảo Khởi Quang', words: 'Ông Đăng: “Hãy đánh thức năm ngọn đèn. Ánh sáng đầu tiên luôn bắt đầu từ một bàn tay nhỏ.”' },
  2: { name: 'Song Đảo Cầu Tre', words: 'Ông Đăng: “Qua cầu không lan can, con hãy tin vào bước chân — và cả những cơn gió lành.”' },
  3: { name: 'Đảo Tháp Gió', words: 'Ông Đăng: “Đêm cuối ở trên cao. Khi bảy ngọn đèn cùng sáng, bình minh sẽ nhớ đường về.”' },
};

const SETTINGS_KEY = 'dao-den-long.settings.v1';

function loadSettings() {
  const defaults = { volume: 0.7, sensitivity: 1 };
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return {
      volume: Number.isFinite(stored.volume) ? THREE.MathUtils.clamp(stored.volume, 0, 1) : defaults.volume,
      sensitivity: Number.isFinite(stored.sensitivity)
        ? THREE.MathUtils.clamp(stored.sensitivity, 0.4, 2)
        : defaults.sensitivity,
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
  flames: document.querySelector('#flames'),
  carried: document.querySelector('#carried'),
  lanterns: document.querySelector('#lantern-count'),
  lanternTotal: document.querySelector('#lantern-total'),
  score: document.querySelector('#score'),
  timer: document.querySelector('#timer'),
  moteBar: document.querySelector('#mote-bar'),
  dashCooldown: document.querySelector('#dash-cooldown'),
  pulseCooldown: document.querySelector('#pulse-cooldown'),
  depositProgress: document.querySelector('#deposit-progress'),
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
  group.userData = { lampMaterial, light, ring, wasLit: false };
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
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xc6a4ff }));
    eye.position.set(side * 0.2, 1.02, 0.69);
    group.add(eye);
  }
  group.userData.bodyMaterial = bodyMaterial;
  group.position.set(...shade.pos);
  scene.add(group);
  return group;
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
    seed: 2026 + currentNight,
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
  syncWorld(0);
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
  const x = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
  const z = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  return {
    move: [x, z],
    cam_yaw_deg: THREE.MathUtils.radToDeg(cameraYaw),
    jump: keys.has('Space'),
    interact: keys.has('KeyE'),
    pulse: keys.has('KeyQ'),
    dash: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    pause: keys.has('KeyP') || keys.has('Escape') || pauseRequested,
  };
}

function handleEvents(events) {
  for (const event of events) {
    if (event.name === 'mote_picked') { audio.cue('pickup'); showToast(`Đom đóm ${event.data.carried}/${contract.tuning.carry_capacity}`); }
    if (event.name === 'lantern_lit') { audio.cue('lantern'); showToast(`${event.data.lantern_id} đã bừng sáng!`); }
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
    audio.cue('win');
  } else {
    audio.cue('loss');
  }
  const finalDawn = result === 'won' && currentNight === 3;
  ui.resultEyebrow.textContent = finalDawn ? 'Bình Minh' : result === 'won' ? `Hoàn thành Đêm ${currentNight}` : 'Sương đen chiến thắng';
  ui.resultTitle.textContent = finalDawn ? 'Ánh sáng đã trở về!' : result === 'won' ? 'Đảo đã sáng!' : 'Đêm chưa kết thúc';
  const reasons = {
    all_lit: `Mây đã thắp đủ ${simulation.lanterns.length} Đèn Lồng Lớn.`,
    dawn: 'Bình minh đến trước khi mọi chiếc đèn được thắp.',
    no_flames: 'Ngọn lửa nhỏ của Mây đã tắt.',
  };
  ui.resultDetail.textContent = reasons[reason] ?? '';
  ui.finalScore.textContent = finalDawn
    ? `Tổng điểm ba Đêm: ${totalScore.toLocaleString('vi-VN')}`
    : `${simulation.score.toLocaleString('vi-VN')} điểm`;
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
    const { lampMaterial, light, ring } = visual.userData;
    lampMaterial.color.setHex(lantern.lit ? 0xffb648 : 0x57435c);
    lampMaterial.emissive.setHex(lantern.lit ? 0xff6c18 : 0x1b1025);
    lampMaterial.emissiveIntensity = lantern.lit ? 2.8 : 0.35;
    light.intensity = lantern.lit ? 4.5 : 0;
    ring.material.opacity = lantern.lit ? 0.11 : 0;
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

  if (simulation.shades.length > previousShadeCount) audio.cue('spawn');
  previousShadeCount = simulation.shades.length;

  const litCount = simulation.lanterns.filter((lantern) => lantern.lit).length;
  ambientLight.intensity = 0.15 + 0.55 * (litCount / simulation.lanterns.length);
  renderer.toneMappingExposure = 1.16 + litCount * 0.06;
  updateHud(litCount);
  updateCamera();
}

function updateHud(litCount) {
  ui.flames.textContent = '🔥'.repeat(simulation.player.flames) || '○';
  ui.carried.textContent = simulation.player.carried;
  ui.lanterns.textContent = litCount;
  ui.lanternTotal.textContent = simulation.lanterns.length;
  ui.score.textContent = simulation.score.toLocaleString('vi-VN');
  const seconds = Math.ceil(simulation.timeLeftS);
  ui.timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  ui.timer.classList.toggle('urgent', seconds <= 30);
  if (seconds <= 10 && seconds !== lastCountdownSecond) {
    audio.cue('countdown');
    lastCountdownSecond = seconds;
  }

  if (ui.moteBar.children.length !== contract.tuning.carry_capacity) {
    ui.moteBar.replaceChildren(...Array.from({ length: contract.tuning.carry_capacity }, () => document.createElement('i')));
  }
  [...ui.moteBar.children].forEach((slot, index) => slot.classList.toggle('filled', index < simulation.player.carried));

  const dashSeconds = simulation.player.dashCooldownTicks / TICK_RATE;
  const pulseSeconds = simulation.player.pulseCooldownTicks / TICK_RATE;
  ui.dashCooldown.textContent = dashSeconds > 0 ? `⇧ Lướt · ${dashSeconds.toFixed(1)}s` : '⇧ Lướt · Sẵn sàng';
  ui.pulseCooldown.textContent = pulseSeconds > 0 ? `Q Tỏa sáng · ${pulseSeconds.toFixed(1)}s` : 'Q Tỏa sáng · Sẵn sàng';

  const unlit = simulation.lanterns
    .filter((lantern) => !lantern.lit)
    .sort((a, b) => Math.hypot(a.pos[0] - simulation.player.pos[0], a.pos[2] - simulation.player.pos[2])
      - Math.hypot(b.pos[0] - simulation.player.pos[0], b.pos[2] - simulation.player.pos[2]));
  const nearLantern = unlit.find((lantern) => Math.hypot(
    lantern.pos[0] - simulation.player.pos[0],
    lantern.pos[2] - simulation.player.pos[2],
  ) <= contract.tuning.interact_radius);
  ui.prompt.classList.toggle('hidden', !nearLantern || simulation.player.carried === 0);
  if (nearLantern) ui.depositProgress.textContent = `${nearLantern.deposited}/${contract.tuning.lantern_cost}`;

  const target = unlit[0];
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

function updateCamera() {
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
}

window.addEventListener('keydown', (event) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyP'].includes(event.code)) event.preventDefault();
  if (event.code === 'Space' && !event.repeat && playing && !simulation.paused) audio.cue('jump');
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
  showNightIntro(1);
});
document.querySelector('#begin-night').addEventListener('click', resetGame);
document.querySelector('#restart').addEventListener('click', (event) => {
  if (event.currentTarget.dataset.result === 'won') {
    if (currentNight < 3) showNightIntro(currentNight + 1);
    else {
      totalScore = 0;
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
  ui.pauseActions.classList.add('hidden');
  ui.settings.classList.remove('hidden');
});
document.querySelector('#close-settings').addEventListener('click', () => {
  ui.settings.classList.add('hidden');
  ui.pauseActions.classList.remove('hidden');
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
});

function persistSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function syncSettingsUi() {
  ui.volume.value = String(Math.round(settings.volume * 100));
  ui.volumeValue.value = `${Math.round(settings.volume * 100)}%`;
  ui.sensitivity.value = String(Math.round(settings.sensitivity * 100));
  ui.sensitivityValue.value = `${Math.round(settings.sensitivity * 100)}%`;
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

buildWorld();
syncSettingsUi();
const searchParams = new URLSearchParams(window.location.search);
if (searchParams.has('autostart') || searchParams.has('benchmark')) {
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
  const output = document.querySelector('#benchmark-result');
  let benchmarkFrames = 0;
  let benchmarkStart = 0;
  const sampleFps = (timestamp) => {
    if (benchmarkStart === 0) benchmarkStart = timestamp;
    benchmarkFrames += 1;
    const elapsedS = (timestamp - benchmarkStart) / 1000;
    if (elapsedS >= 3) {
      const fps = benchmarkFrames / elapsedS;
      output.value = `fps=${fps.toFixed(2)}`;
      document.body.dataset.benchmarkFps = fps.toFixed(2);
      return;
    }
    requestAnimationFrame(sampleFps);
  };
  requestAnimationFrame(sampleFps);
}
animate();

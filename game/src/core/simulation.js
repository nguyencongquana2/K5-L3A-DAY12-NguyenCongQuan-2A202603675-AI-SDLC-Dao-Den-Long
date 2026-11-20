import { SeededRng } from './rng.js';
import { CHARM_DURATION_TICKS, CHARM_RESPAWN_TICKS, CHARM_SPEED, TICK_RATE } from './constants.js';
import { getNightConfig } from './night-configs.js';

export { TICK_RATE } from './constants.js';
export const ISLAND_RADIUS = 38;
export const JUMP_SPEED = 7;
export const GRAVITY = 18;

const copyVec = (value) => value.map(Number);
const distanceXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const secondsToTicks = (seconds) => Math.round(seconds * TICK_RATE);
const round3 = (value) => Math.round((value + Number.EPSILON) * 1000) / 1000;
const round1 = (value) => Math.round((value + Number.EPSILON) * 10) / 10;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateVec(value, label) {
  assert(Array.isArray(value) && value.length === 3, `${label} must be [x, y, z]`);
  assert(value.every(Number.isFinite), `${label} must contain finite numbers`);
}

function defaultLanterns(count) {
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / 5;
    return {
      id: `L${index + 1}`,
      pos: [round3(Math.cos(angle) * 24), 0, round3(Math.sin(angle) * 24)],
      deposited: 0,
      lit: false,
      fuel: 0,
      fuelUnits: 0,
      everLit: false,
      relitCount: 0,
    };
  });
}

function randomGroundPosition(rng, minRadius = 4, maxRadius = 34) {
  const angle = rng.range(0, Math.PI * 2);
  const radius = Math.sqrt(rng.range(minRadius ** 2, maxRadius ** 2));
  return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
}

function defaultMotes(rng) {
  return Array.from({ length: 24 }, (_, index) => ({
    id: `M${index + 1}`,
    pos: randomGroundPosition(rng),
    kind: 'random',
    ttlTicks: null,
  }));
}

function defaultShades(rng) {
  return Array.from({ length: 3 }, (_, index) => ({
    id: `S${index + 1}`,
    pos: randomGroundPosition(rng, 18, 33),
    state: 'chase',
    stunTicks: 0,
    stateTicksLeft: 0,
    targetLanternId: null,
    drainTicks: 0,
  }));
}

function configMotes(config) {
  return config.moteSpawnPoints.map((pos, index) => ({
    id: `M${index + 1}`,
    pos: copyVec(pos),
    kind: 'random',
    ttlTicks: null,
  }));
}

/** Deterministic gameplay core; rendering and wall-clock time stay outside. */
export class Simulation {
  constructor({ seed = 1, tuning, scenario = {}, contractVersion = '1.0', night = 1 }) {
    assert(tuning && typeof tuning === 'object', 'tuning is required');
    assert(scenario && typeof scenario === 'object' && !Array.isArray(scenario), 'scenario must be an object');
    assert(['1.0', '1.1', '1.2'].includes(contractVersion), 'contractVersion must be 1.0, 1.1, or 1.2');
    assert([1, 2, 3].includes(night), 'night must be 1, 2, or 3');

    this.tuning = structuredClone(tuning);
    this.contractVersion = contractVersion;
    this.night = night;
    this.nightConfig = contractVersion !== '1.0' ? getNightConfig(night) : null;
    this.rng = new SeededRng(seed);
    this.seed = Number(seed);
    this.tick = 0;
    this.simTick = 0;
    this.state = 'playing';
    this.paused = false;
    this.score = 0;
    this.endBonusApplied = false;
    this.dropSequence = 0;
    this.shadeSequence = 0;
    this.drifterSequence = 0;
    this.randomShadesEnabled = true;
    this.randomDriftersEnabled = true;
    this.inputPrevious = { jump: false, interact: false, pulse: false, dash: false, pause: false };
    this.player = {
      pos: [0, 0, 0],
      velocityX: 0,
      velocityY: 0,
      velocityZ: 0,
      facing: [0, 1],
      carried: 0,
      flames: tuning.flames,
      invulnTicks: 0,
      pulseCooldownTicks: 0,
      charmTicks: 0,
      dashTicks: 0,
      dashCooldownTicks: 0,
      dashDirection: [0, 1],
      launchLocked: false,
      launchVelocity: [0, 0],
      successfulLights: 0,
    };
    if (this.nightConfig?.start) {
      this.player.pos = copyVec(this.nightConfig.start.pos);
      this.player.facing = [this.nightConfig.start.facing[0], this.nightConfig.start.facing[2]];
    }
    this.respawnPosition = copyVec(this.player.pos);
    this.lanterns = this.nightConfig
      ? this.nightConfig.lanterns.map((lantern) => ({
        id: lantern.id,
        pos: copyVec(lantern.pos),
        deposited: 0,
        lit: false,
        fuel: 0,
        fuelUnits: 0,
        everLit: false,
        relitCount: 0,
      }))
      : defaultLanterns(tuning.lantern_count_night1);
    this.motes = this.nightConfig ? configMotes(this.nightConfig) : defaultMotes(this.rng);
    this.shades = this.nightConfig ? [] : defaultShades(this.rng);
    this.drifters = [];
    this.charms = this.usesPhase2
      ? this.nightConfig.charms.map((charm) => ({ ...charm, available: true, respawnTicks: 0 }))
      : [];
    this.windEnabled = this.usesPhase2 && night === 3;
    this.wind = { active: false, warning: false, dirDeg: 0, cycle: 0 };
    this.initialDurationS = tuning[`night${night}_duration_s`];
    assert(Number.isFinite(this.initialDurationS) && this.initialDurationS > 0, `night${night}_duration_s must be positive`);

    this.applyScenario(scenario);
  }

  applyScenario(scenario) {
    const allowedScenarioFields = new Set([
      'player', 'random_motes', 'random_shades', 'motes', 'shades', 'lanterns', 'time_left_s'
    ]);
    if (this.usesPhase2) {
      allowedScenarioFields.add('random_drifters');
      allowedScenarioFields.add('drifters');
      allowedScenarioFields.add('charms');
      allowedScenarioFields.add('wind_enabled');
    }
    for (const field of Object.keys(scenario)) {
      assert(allowedScenarioFields.has(field), `unknown scenario field: ${field}`);
    }
    const randomFlags = this.usesPhase2
      ? ['random_motes', 'random_shades', 'random_drifters']
      : ['random_motes', 'random_shades'];
    for (const flag of randomFlags) {
      if (scenario[flag] !== undefined) assert(typeof scenario[flag] === 'boolean', `${flag} must be boolean`);
    }
    if (scenario.random_shades !== undefined) this.randomShadesEnabled = scenario.random_shades;
    if (scenario.random_drifters !== undefined) this.randomDriftersEnabled = scenario.random_drifters;
    if (scenario.player !== undefined) {
      assert(scenario.player && typeof scenario.player === 'object', 'scenario.player must be an object');
      const allowedPlayerFields = this.usesPhase2
        ? ['pos', 'carried', 'flames', 'invuln_ticks', 'dash_cd_ticks', 'pulse_cd_ticks', 'charm_ticks']
        : ['pos', 'carried', 'flames'];
      if (this.usesPhase3) allowedPlayerFields.push('successful_lights');
      for (const field of Object.keys(scenario.player)) {
        assert(allowedPlayerFields.includes(field), `unknown player field: ${field}`);
      }
      if (scenario.player.pos !== undefined) {
        validateVec(scenario.player.pos, 'scenario.player.pos');
        this.player.pos = copyVec(scenario.player.pos);
      }
      if (scenario.player.carried !== undefined) {
        assert(Number.isInteger(scenario.player.carried) && scenario.player.carried >= 0, 'player.carried must be a non-negative integer');
        this.player.carried = scenario.player.carried;
      }
      if (scenario.player.flames !== undefined) {
        assert(Number.isInteger(scenario.player.flames) && scenario.player.flames >= 0, 'player.flames must be a non-negative integer');
        this.player.flames = scenario.player.flames;
      }
      if (scenario.player.successful_lights !== undefined) {
        assert(
          Number.isInteger(scenario.player.successful_lights) && scenario.player.successful_lights >= 0,
          'player.successful_lights must be a non-negative integer'
        );
        this.player.successfulLights = scenario.player.successful_lights;
      }
      const counterFields = [
        ['invuln_ticks', 'invulnTicks'],
        ['dash_cd_ticks', 'dashCooldownTicks'],
        ['pulse_cd_ticks', 'pulseCooldownTicks'],
        ['charm_ticks', 'charmTicks'],
      ];
      for (const [scenarioField, playerField] of counterFields) {
        if (scenario.player[scenarioField] === undefined) continue;
        assert(
          Number.isInteger(scenario.player[scenarioField]) && scenario.player[scenarioField] >= 0,
          `player.${scenarioField} must be a non-negative integer`
        );
        this.player[playerField] = scenario.player[scenarioField];
      }
    }

    if (scenario.time_left_s !== undefined) {
      assert(Number.isFinite(scenario.time_left_s) && scenario.time_left_s >= 0, 'time_left_s must be a non-negative number');
      this.initialDurationS = scenario.time_left_s;
    }

    if (scenario.motes !== undefined) {
      assert(Array.isArray(scenario.motes), 'scenario.motes must be an array');
      this.motes = scenario.motes.map((pos, index) => {
        validateVec(pos, `scenario.motes[${index}]`);
        return { id: `M${index + 1}`, pos: copyVec(pos), kind: 'random', ttlTicks: null };
      });
    } else if (scenario.random_motes === false) {
      this.motes = [];
    }

    if (scenario.shades !== undefined) {
      assert(Array.isArray(scenario.shades), 'scenario.shades must be an array');
      const ids = new Set();
      this.shades = scenario.shades.map((shade, index) => {
        assert(shade && typeof shade === 'object', `scenario.shades[${index}] must be an object`);
        const allowedShadeFields = this.usesPhase2
          ? ['id', 'pos', 'state', 'state_ticks_left']
          : ['id', 'pos'];
        if (this.usesPhase3) allowedShadeFields.push('target_lantern_id');
        for (const field of Object.keys(shade)) {
          assert(allowedShadeFields.includes(field), `unknown shade field: ${field}`);
        }
        validateVec(shade.pos, `scenario.shades[${index}].pos`);
        const id = shade.id ?? `S${index + 1}`;
        const state = shade.state ?? 'chase';
        const stateTicksLeft = shade.state_ticks_left ?? 0;
        const targetLanternId = shade.target_lantern_id ?? null;
        assert(typeof id === 'string' && id.length > 0 && !ids.has(id), 'shade ids must be unique non-empty strings');
        assert(
          ['spawning', 'wander', 'chase', 'recoil', 'stunned', ...(this.usesPhase3 ? ['drain'] : [])].includes(state),
          `invalid shade state: ${state}`
        );
        assert(Number.isInteger(stateTicksLeft) && stateTicksLeft >= 0, 'shade.state_ticks_left must be a non-negative integer');
        assert(
          targetLanternId === null ||
          (typeof targetLanternId === 'string' && this.lanterns.some((lantern) => lantern.id === targetLanternId)),
          'shade.target_lantern_id must be null or a known lantern id'
        );
        ids.add(id);
        return {
          id,
          pos: copyVec(shade.pos),
          state,
          stateTicksLeft,
          stunTicks: state === 'stunned' ? stateTicksLeft : 0,
          targetLanternId,
          drainTicks: 0,
        };
      });
    } else if (scenario.random_shades === false) {
      this.shades = [];
    }

    if (scenario.drifters !== undefined) {
      assert(Array.isArray(scenario.drifters), 'scenario.drifters must be an array');
      const ids = new Set();
      const states = new Set(['idle', 'chase', 'flee', 'removed']);
      this.drifters = scenario.drifters.map((drifter, index) => {
        assert(drifter && typeof drifter === 'object', `scenario.drifters[${index}] must be an object`);
        for (const field of Object.keys(drifter)) {
          assert(
            ['id', 'pos', 'state', 'stolen', 'state_ticks_left'].includes(field),
            `unknown drifter field: ${field}`
          );
        }
        validateVec(drifter.pos, `scenario.drifters[${index}].pos`);
        const id = drifter.id ?? `D${index + 1}`;
        const state = drifter.state ?? 'idle';
        const stolen = drifter.stolen ?? 0;
        const stateTicksLeft = drifter.state_ticks_left ?? 0;
        assert(typeof id === 'string' && id.length > 0 && !ids.has(id), 'drifter ids must be unique non-empty strings');
        assert(states.has(state), `invalid drifter state: ${state}`);
        assert(Number.isInteger(stolen) && stolen >= 0, 'drifter.stolen must be a non-negative integer');
        assert(Number.isInteger(stateTicksLeft) && stateTicksLeft >= 0, 'drifter.state_ticks_left must be a non-negative integer');
        ids.add(id);
        const idleAngle = this.rng.range(0, Math.PI * 2);
        return {
          id,
          pos: copyVec(drifter.pos),
          state,
          stolen,
          stateTicksLeft,
          hasStolen: stolen > 0 || state === 'flee',
          idleDirection: [Math.cos(idleAngle), Math.sin(idleAngle)],
        };
      });
    } else if (scenario.random_drifters === false) {
      this.drifters = [];
    }

    if (scenario.charms !== undefined) {
      assert(Array.isArray(scenario.charms), 'scenario.charms must be an array');
      const ids = new Set();
      this.charms = scenario.charms.map((charm, index) => {
        assert(charm && typeof charm === 'object', `scenario.charms[${index}] must be an object`);
        for (const field of Object.keys(charm)) {
          assert(['id', 'pos', 'available', 'respawn_ticks'].includes(field), `unknown charm field: ${field}`);
        }
        validateVec(charm.pos, `scenario.charms[${index}].pos`);
        const id = charm.id ?? `C${index + 1}`;
        const available = charm.available ?? true;
        const respawnTicks = charm.respawn_ticks ?? 0;
        assert(typeof id === 'string' && id.length > 0 && !ids.has(id), 'charm ids must be unique non-empty strings');
        assert(typeof available === 'boolean', 'charm.available must be boolean');
        assert(Number.isInteger(respawnTicks) && respawnTicks >= 0, 'charm.respawn_ticks must be a non-negative integer');
        ids.add(id);
        return { id, pos: copyVec(charm.pos), available, respawnTicks };
      });
    }

    if (scenario.wind_enabled !== undefined) {
      assert(typeof scenario.wind_enabled === 'boolean', 'wind_enabled must be boolean');
      this.windEnabled = scenario.wind_enabled;
    }

    if (scenario.lanterns !== undefined) {
      assert(Array.isArray(scenario.lanterns), 'scenario.lanterns must be an array');
      for (const update of scenario.lanterns) {
        assert(update && typeof update === 'object', 'each lantern update must be an object');
        for (const field of Object.keys(update)) {
          const allowed = ['id', 'pos', 'deposited', 'lit'];
          if (this.usesPhase3) allowed.push('fuel', 'ever_lit');
          assert(allowed.includes(field), `unknown lantern field: ${field}`);
        }
        const lantern = this.lanterns.find((item) => item.id === update.id);
        assert(lantern, `unknown lantern id: ${update.id}`);
        if (update.pos !== undefined) {
          validateVec(update.pos, `lantern ${update.id}.pos`);
          lantern.pos = copyVec(update.pos);
        }
        if (update.deposited !== undefined) {
          assert(Number.isInteger(update.deposited) && update.deposited >= 0, 'lantern.deposited must be a non-negative integer');
          lantern.deposited = update.deposited;
        }
        if (update.lit !== undefined) {
          assert(typeof update.lit === 'boolean', 'lantern.lit must be boolean');
          lantern.lit = update.lit;
        }
        if (lantern.deposited >= this.tuning.lantern_cost) lantern.lit = true;
        if (this.usesPhase3) {
          if (update.ever_lit !== undefined) {
            assert(typeof update.ever_lit === 'boolean', 'lantern.ever_lit must be boolean');
            lantern.everLit = update.ever_lit;
          }
          if (update.fuel !== undefined) {
            assert(Number.isFinite(update.fuel) && update.fuel >= 0 && update.fuel <= this.tuning.fuel_max, 'lantern.fuel must be between 0 and fuel_max');
            this.setLanternFuel(lantern, update.fuel);
          } else {
            this.setLanternFuel(lantern, lantern.lit ? this.tuning.fuel_max : 0);
          }
          if (lantern.lit) lantern.everLit = true;
          if (!lantern.lit) this.setLanternFuel(lantern, 0);
        }
      }
    }
  }

  get timeLeftS() {
    return Math.max(0, this.initialDurationS - this.simTick / TICK_RATE);
  }

  get outputState() {
    return this.paused ? 'paused' : this.state;
  }

  get usesPhase2() {
    return this.contractVersion === '1.1' || this.contractVersion === '1.2';
  }

  get usesPhase3() {
    return this.contractVersion === '1.2';
  }

  get capacity() {
    if (!this.usesPhase3) return this.tuning.carry_capacity;
    return Math.min(this.tuning.capacity_max, this.tuning.carry_capacity + 2 * this.player.successfulLights);
  }

  get usesPhase2Scoring() {
    return this.usesPhase2;
  }

  step(input = {}) {
    if (this.state !== 'playing') return [];

    const events = [];
    const current = {
      move: Array.isArray(input.move) ? input.move : [0, 0],
      cam_yaw_deg: Number.isFinite(input.cam_yaw_deg) ? input.cam_yaw_deg : 0,
      jump: input.jump === true,
      interact: input.interact === true,
      pulse: input.pulse === true,
      dash: input.dash === true,
      pause: input.pause === true,
    };
    const rising = (name) => current[name] && !this.inputPrevious[name];

    if (rising('pause') && !this.paused) {
      this.paused = true;
      this.tick += 1;
      this.inputPrevious = current;
      return [{ name: 'paused', data: {} }];
    }
    if (this.paused && !rising('pause')) {
      this.tick += 1;
      this.inputPrevious = current;
      return events;
    }
    if (this.paused && rising('pause')) {
      this.paused = false;
      events.push({ name: 'resumed', data: {} });
    }

    if (this.player.invulnTicks > 0) this.player.invulnTicks -= 1;
    if (this.player.pulseCooldownTicks > 0) this.player.pulseCooldownTicks -= 1;
    if (this.player.dashCooldownTicks > 0) this.player.dashCooldownTicks -= 1;
    if (this.player.charmTicks > 0) this.player.charmTicks -= 1;
    for (const shade of this.shades) {
      if (!this.usesPhase2 || shade.stateTicksLeft <= 0) continue;
      shade.stateTicksLeft -= 1;
      shade.stunTicks = shade.stateTicksLeft;
      if (shade.stateTicksLeft === 0 && ['stunned', 'spawning', 'recoil'].includes(shade.state)) {
        shade.state = this.usesPhase3 ? 'wander' : 'chase';
        shade.targetLanternId = null;
      }
    }
    for (const mote of this.motes) {
      if (Number.isInteger(mote.ttlTicks) && mote.ttlTicks > 0) mote.ttlTicks -= 1;
    }
    this.motes = this.motes.filter((mote) => mote.ttlTicks === null || mote.ttlTicks > 0);
    for (const charm of this.charms) {
      if (charm.available || charm.respawnTicks <= 0) continue;
      charm.respawnTicks -= 1;
      if (charm.respawnTicks === 0) charm.available = true;
    }
    for (const drifter of this.drifters) {
      if (drifter.state !== 'flee' || drifter.stateTicksLeft <= 0) continue;
      drifter.stateTicksLeft -= 1;
      if (drifter.stateTicksLeft === 0) drifter.state = 'removed';
    }

    if (this.usesPhase3) this.updateLanternFuel(events);

    this.updateWindState();

    this.movePlayer(current, rising('jump'), rising('dash'), events);
    this.collectMotes(events);
    this.collectCharms(events);
    if (rising('interact')) this.interact(events);
    if (rising('pulse')) this.pulse(events);
    if (this.usesPhase2) {
      this.updateDrifters();
      this.updateShades(events, false);
      this.resolveDrifterContacts(events);
      this.resolveShadeContacts(events);
      this.spawnScheduledEntities();
    } else {
      this.updateShades(events);
    }

    this.simTick += 1;
    this.tick += 1;
    this.inputPrevious = current;
    this.checkTerminal(events);
    return events;
  }

  movePlayer(input, jump, dash, events) {
    let [x, z] = input.move;
    x = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    z = Number.isFinite(z) ? Math.max(-1, Math.min(1, z)) : 0;
    const length = Math.hypot(x, z);
    if (length > 1) {
      x /= length;
      z /= length;
    }

    const yaw = (input.cam_yaw_deg * Math.PI) / 180;
    const worldX = x * Math.cos(yaw) + z * Math.sin(yaw);
    const worldZ = -x * Math.sin(yaw) + z * Math.cos(yaw);
    if (Math.hypot(worldX, worldZ) > 0) this.player.facing = [worldX, worldZ];

    if (
      this.usesPhase2 &&
      dash &&
      this.player.dashTicks === 0 &&
      this.player.dashCooldownTicks === 0
    ) {
      assert(Number.isFinite(this.tuning.dash_speed) && this.tuning.dash_speed > 0, 'tuning.dash_speed must be positive');
      assert(Number.isFinite(this.tuning.dash_duration_s) && this.tuning.dash_duration_s > 0, 'tuning.dash_duration_s must be positive');
      assert(Number.isFinite(this.tuning.dash_cooldown_s) && this.tuning.dash_cooldown_s >= 0, 'tuning.dash_cooldown_s must be non-negative');
      this.player.dashDirection = [...this.player.facing];
      this.player.dashTicks = secondsToTicks(this.tuning.dash_duration_s);
      this.player.dashCooldownTicks = this.player.charmTicks > 0
        ? 0
        : secondsToTicks(this.tuning.dash_cooldown_s);
      events.push({ name: 'dash', data: {} });
    }

    const previousX = this.player.pos[0];
    const previousZ = this.player.pos[2];
    const playerSpeed = this.player.charmTicks > 0 ? CHARM_SPEED : this.tuning.player_speed;
    if (this.player.dashTicks > 0) {
      this.player.velocityX = this.player.dashDirection[0] * this.tuning.dash_speed;
      this.player.velocityZ = this.player.dashDirection[1] * this.tuning.dash_speed;
      this.player.dashTicks -= 1;
    } else if (this.player.launchLocked) {
      this.player.velocityX = this.player.launchVelocity[0];
      this.player.velocityZ = this.player.launchVelocity[1];
    } else {
      this.player.velocityX = worldX * playerSpeed;
      this.player.velocityZ = worldZ * playerSpeed;
    }
    if (this.wind.active) {
      const windAngle = (this.wind.dirDeg * Math.PI) / 180;
      this.player.velocityX += Math.cos(windAngle) * 2;
      this.player.velocityZ += Math.sin(windAngle) * 2;
    }
    this.player.pos[0] += this.player.velocityX / TICK_RATE;
    this.player.pos[2] += this.player.velocityZ / TICK_RATE;

    if (!this.nightConfig && !this.tuning.fall_enabled) {
      const groundRadius = Math.hypot(this.player.pos[0], this.player.pos[2]);
      if (groundRadius > ISLAND_RADIUS) {
        this.player.pos[0] = (this.player.pos[0] / groundRadius) * ISLAND_RADIUS;
        this.player.pos[2] = (this.player.pos[2] / groundRadius) * ISLAND_RADIUS;
      }
    }

    const ground = this.groundHeightAt(this.player.pos[0], this.player.pos[2], this.player.pos[1]);
    if (ground !== null && ground > this.player.pos[1] + 0.55) {
      this.player.pos[0] = previousX;
      this.player.pos[2] = previousZ;
    }

    const standingGround = this.groundHeightAt(this.player.pos[0], this.player.pos[2], this.player.pos[1]);
    const grounded = standingGround !== null && Math.abs(this.player.pos[1] - standingGround) < 0.05 && this.player.velocityY <= 0;
    if (grounded) this.tryLaunchPad();
    if (jump && grounded && !this.player.launchLocked) this.player.velocityY = JUMP_SPEED;
    this.player.velocityY -= GRAVITY / TICK_RATE;
    this.player.pos[1] += this.player.velocityY / TICK_RATE;
    const landingGround = this.groundHeightAt(this.player.pos[0], this.player.pos[2], this.player.pos[1] + 0.3);
    if (landingGround !== null && this.player.pos[1] <= landingGround && this.player.velocityY <= 0) {
      this.player.pos[1] = landingGround;
      this.player.velocityY = 0;
      this.player.launchLocked = false;
    }

    if (this.player.pos[1] < -8) {
      this.handleFall(events);
    }
  }

  groundHeightAt(x, z, maxY = Infinity) {
    if (!this.nightConfig) {
      return Math.hypot(x, z) <= ISLAND_RADIUS ? 0 : null;
    }
    if (this.night === 1) return Math.hypot(x, z) <= 40 ? 0 : null;
    if (this.night === 2) {
      const onIsland = this.nightConfig.terrain.islands.some((island) =>
        Math.hypot(x - island.center[0], z - island.center[2]) <= island.radius
      );
      const onBridge = x >= 26 && x <= 44 && z >= -2 && z <= 2;
      return onIsland || onBridge ? 0 : null;
    }

    const radius = Math.hypot(x, z);
    if (radius > 45) return null;
    const surfaces = [0];
    const angleDeg = ((Math.atan2(z, x) * 180) / Math.PI + 360) % 360;
    for (const rampAngle of [30, 150]) {
      const angularDistance = Math.abs((((angleDeg - rampAngle + 180) % 360) + 360) % 360 - 180);
      const lateralDistance = radius * Math.sin((angularDistance * Math.PI) / 180);
      if (radius >= 24 && radius <= 30 && Math.abs(lateralDistance) <= 1.5) {
        surfaces.push(((30 - radius) / 6) * 3);
      }
    }
    if (z > 0 && radius >= 12 && radius <= 24) surfaces.push(3);
    if (radius <= 8) surfaces.push(6);
    const candidates = surfaces.filter((height) => height <= maxY + 0.55);
    return candidates.length ? Math.max(...candidates) : null;
  }

  tryLaunchPad() {
    if (!this.nightConfig || this.player.launchLocked) return;
    const pad = this.nightConfig.terrain.launchPads.find((item) => distanceXZ(this.player.pos, item.pos) <= item.radius);
    if (!pad) return;
    let directionX;
    let directionZ;
    if (pad.target) {
      directionX = pad.target[0] - this.player.pos[0];
      directionZ = pad.target[2] - this.player.pos[2];
      const length = Math.hypot(directionX, directionZ) || 1;
      directionX /= length;
      directionZ /= length;
    } else {
      [directionX, , directionZ] = pad.direction;
    }
    this.player.velocityY = pad.velocityY;
    this.player.launchVelocity = [directionX * pad.horizontalSpeed, directionZ * pad.horizontalSpeed];
    this.player.launchLocked = true;
  }

  handleFall(events) {
    const lost = this.player.carried;
    this.player.carried = 0;
    this.player.flames = Math.max(0, this.player.flames - 1);
    this.player.invulnTicks = secondsToTicks(this.tuning.invuln_s);
    this.player.pos = copyVec(this.respawnPosition);
    this.player.velocityX = 0;
    this.player.velocityY = 0;
    this.player.velocityZ = 0;
    this.player.launchLocked = false;
    events.push({ name: 'player_hit', data: { by: 'fall', flames: this.player.flames, dropped: 0, lost } });
  }

  collectMotes(events) {
    const remaining = [];
    for (const mote of this.motes) {
      if (
        this.player.carried < this.capacity &&
        distanceXZ(this.player.pos, mote.pos) <= this.tuning.pickup_radius
      ) {
        this.player.carried += 1;
        if (!this.usesPhase2Scoring) this.score += this.tuning.score.per_mote;
        events.push({ name: 'mote_picked', data: { carried: this.player.carried } });
      } else {
        remaining.push(mote);
      }
    }
    this.motes = remaining;
  }

  setLanternFuel(lantern, fuel) {
    const clamped = Math.max(0, Math.min(this.tuning.fuel_max, Number(fuel)));
    lantern.fuelUnits = Math.round(clamped * TICK_RATE);
    lantern.fuel = lantern.fuelUnits / TICK_RATE;
  }

  syncLanternFuel(lantern) {
    lantern.fuelUnits = Math.max(0, Math.min(this.tuning.fuel_max * TICK_RATE, lantern.fuelUnits));
    lantern.fuel = lantern.fuelUnits / TICK_RATE;
  }

  updateLanternFuel(events) {
    const litAtStart = new Set(this.lanterns.filter((lantern) => lantern.lit).map((lantern) => lantern.id));
    const decayUnits = Math.round(this.tuning.fuel_decay_per_s);
    for (const lantern of this.lanterns) {
      if (litAtStart.has(lantern.id)) lantern.fuelUnits -= decayUnits;
    }

    const drainEvents = [];
    const draining = [...this.shades]
      .filter((shade) => shade.state === 'drain')
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const shade of draining) {
      const lantern = this.lanterns.find((item) => item.id === shade.targetLanternId);
      if (!lantern || !litAtStart.has(lantern.id)) continue;
      lantern.fuelUnits -= Math.round(this.tuning.drain_per_s);
      shade.drainTicks = (shade.drainTicks ?? 0) + 1;
      if (shade.drainTicks % TICK_RATE === 0) drainEvents.push({ lantern, shade });
    }

    for (const lantern of this.lanterns) this.syncLanternFuel(lantern);
    for (const { lantern, shade } of drainEvents) {
      events.push({
        name: 'fuel_drain',
        data: { lantern_id: lantern.id, shade_id: shade.id, fuel: round1(lantern.fuel) },
      });
    }
    for (const lantern of this.lanterns) {
      if (!lantern.lit || lantern.fuelUnits > 0) continue;
      lantern.lit = false;
      lantern.deposited = 0;
      lantern.everLit = true;
      this.setLanternFuel(lantern, 0);
      events.push({ name: 'lantern_out', data: { lantern_id: lantern.id } });
    }
  }

  updateWindState() {
    this.wind.active = false;
    this.wind.warning = false;
    if (!this.windEnabled) return;

    const intervalTicks = 30 * TICK_RATE;
    const warningTicks = 2 * TICK_RATE;
    const activeTicks = 5 * TICK_RATE;
    const offset = this.simTick % intervalTicks;
    const completedCycles = Math.floor(this.simTick / intervalTicks);
    const activeCycle = completedCycles >= 1 && offset < activeTicks ? completedCycles : 0;
    const warningCycle = offset >= intervalTicks - warningTicks ? completedCycles + 1 : 0;
    const targetCycle = activeCycle || warningCycle;

    if (targetCycle > 0 && this.wind.cycle !== targetCycle) {
      this.wind.cycle = targetCycle;
      this.wind.dirDeg = this.rng.range(0, 360);
    }
    this.wind.active = activeCycle > 0;
    this.wind.warning = warningCycle > 0;
  }

  spawnScheduledEntities() {
    const nextTick = this.simTick + 1;
    const schedule = this.nightConfig.shadeSchedule;
    const activeShades = this.shades.filter((shade) => shade.state !== 'removed').length;
    let shadeCount = 0;
    if (!this.randomShadesEnabled) {
      shadeCount = 0;
    } else if (schedule.firstTick !== undefined && nextTick === schedule.firstTick) {
      shadeCount = schedule.firstCount;
    } else {
      const firstTick = schedule.firstTick ?? schedule.intervalTicks;
      if (nextTick >= firstTick && (nextTick - firstTick) % schedule.intervalTicks === 0) shadeCount = 1;
    }
    shadeCount = Math.min(shadeCount, schedule.maxAlive - activeShades);
    for (let index = 0; index < shadeCount; index += 1) {
      let points = this.nightConfig.shadeSpawnPoints;
      if (this.night === 1) {
        const distant = points.filter((pos) => distanceXZ(pos, this.player.pos) >= 15);
        if (distant.length) points = distant;
      }
      const pos = points[Math.floor(this.rng.range(0, points.length))];
      this.shadeSequence += 1;
      this.shades.push({
        id: `S${this.shadeSequence}`,
        pos: copyVec(pos),
        state: 'spawning',
        stunTicks: 0,
        stateTicksLeft: TICK_RATE,
        targetLanternId: null,
        drainTicks: 0,
      });
    }

    if (this.randomDriftersEnabled && this.night >= 2 && nextTick % 1200 === 0) {
      const activeDrifters = this.drifters.filter((drifter) => drifter.state !== 'removed').length;
      if (activeDrifters < 2) {
        const points = this.nightConfig.shadeSpawnPoints;
        const pos = points[Math.floor(this.rng.range(0, points.length))];
        const idleAngle = this.rng.range(0, Math.PI * 2);
        this.drifterSequence += 1;
        this.drifters.push({
          id: `D${this.drifterSequence}`,
          pos: copyVec(pos),
          state: 'idle',
          stolen: 0,
          stateTicksLeft: 0,
          hasStolen: false,
          idleDirection: [Math.cos(idleAngle), Math.sin(idleAngle)],
        });
      }
    }
  }

  collectCharms(events) {
    for (const charm of this.charms) {
      if (!charm.available || distanceXZ(this.player.pos, charm.pos) > this.tuning.pickup_radius) continue;
      charm.available = false;
      charm.respawnTicks = CHARM_RESPAWN_TICKS;
      this.player.charmTicks = CHARM_DURATION_TICKS;
      events.push({ name: 'charm_picked', data: { charm_id: charm.id, charm_ticks: CHARM_DURATION_TICKS } });
    }
  }

  interact(events) {
    if (this.usesPhase3) {
      this.interactPhase3(events);
      return;
    }
    const candidates = this.lanterns
      .filter((lantern) => !lantern.lit && distanceXZ(this.player.pos, lantern.pos) <= this.tuning.interact_radius)
      .sort((a, b) => distanceXZ(this.player.pos, a.pos) - distanceXZ(this.player.pos, b.pos) || a.id.localeCompare(b.id));
    const lantern = candidates[0];
    if (!lantern || this.player.carried <= 0) return;

    const amount = Math.min(this.player.carried, this.tuning.lantern_cost - lantern.deposited);
    if (amount <= 0) return;
    this.player.carried -= amount;
    lantern.deposited += amount;
    if (this.usesPhase2Scoring) this.score += amount * this.tuning.score.per_mote;
    events.push({ name: 'deposit', data: { lantern_id: lantern.id, amount, deposited: lantern.deposited } });
    if (lantern.deposited >= this.tuning.lantern_cost) {
      lantern.lit = true;
      this.score += this.tuning.score.per_lantern;
      events.push({ name: 'lantern_lit', data: { lantern_id: lantern.id } });
    }
  }

  interactPhase3(events) {
    const maxFuelUnits = this.tuning.fuel_max * TICK_RATE;
    const candidates = this.lanterns
      .filter((lantern) =>
        (!lantern.lit || lantern.fuelUnits < maxFuelUnits) &&
        distanceXZ(this.player.pos, lantern.pos) <= this.tuning.interact_radius
      )
      .sort((a, b) => distanceXZ(this.player.pos, a.pos) - distanceXZ(this.player.pos, b.pos) || a.id.localeCompare(b.id));
    const lantern = candidates[0];
    if (!lantern || this.player.carried <= 0) return;

    if (lantern.lit) {
      const previousFuel = lantern.fuel;
      const unitsPerMote = this.tuning.fuel_per_mote * TICK_RATE;
      const used = Math.min(this.player.carried, Math.ceil((maxFuelUnits - lantern.fuelUnits) / unitsPerMote));
      if (used <= 0) return;
      this.player.carried -= used;
      lantern.fuelUnits = Math.min(maxFuelUnits, lantern.fuelUnits + unitsPerMote * used);
      this.syncLanternFuel(lantern);
      this.score += used * this.tuning.score.per_fuel_mote;
      events.push({
        name: 'refuel',
        data: { lantern_id: lantern.id, amount: used, fuel: round1(lantern.fuel) },
      });
      if (previousFuel < this.tuning.low_fuel_threshold && lantern.fuel >= this.tuning.low_fuel_threshold) {
        this.pushShadesFromLantern(lantern);
      }
      return;
    }

    const relight = lantern.everLit;
    const cost = relight ? this.tuning.relight_cost : this.tuning.lantern_cost;
    const amount = Math.min(this.player.carried, cost - lantern.deposited);
    if (amount <= 0) return;
    this.player.carried -= amount;
    lantern.deposited += amount;
    this.score += amount * this.tuning.score.per_fuel_mote;
    events.push({ name: 'deposit', data: { lantern_id: lantern.id, amount, deposited: lantern.deposited } });
    if (lantern.deposited < cost) return;

    lantern.lit = true;
    lantern.everLit = true;
    if (relight) lantern.relitCount += 1;
    this.setLanternFuel(lantern, this.tuning.fuel_max);
    this.player.successfulLights += 1;
    this.score += relight ? this.tuning.score.per_relight : this.tuning.score.per_first_light;
    events.push({ name: 'lantern_lit', data: { lantern_id: lantern.id, relight } });
    this.pushShadesFromLantern(lantern);
  }

  pushShadesFromLantern(lantern) {
    const pushRadius = this.tuning.pulse_radius;
    for (const shade of this.shades) {
      let dx = shade.pos[0] - lantern.pos[0];
      let dz = shade.pos[2] - lantern.pos[2];
      const distance = Math.hypot(dx, dz);
      if (distance >= pushRadius) continue;
      if (distance === 0) {
        dx = 1;
        dz = 0;
      } else {
        dx /= distance;
        dz /= distance;
      }
      shade.pos[0] = lantern.pos[0] + dx * pushRadius;
      shade.pos[2] = lantern.pos[2] + dz * pushRadius;
      shade.state = 'recoil';
      shade.stateTicksLeft = 30;
      shade.stunTicks = 0;
      shade.targetLanternId = null;
      shade.drainTicks = 0;
    }
  }

  pulse(events) {
    if (this.player.carried < this.tuning.pulse_cost || this.player.pulseCooldownTicks > 0) return;
    this.player.carried -= this.tuning.pulse_cost;
    this.player.pulseCooldownTicks = secondsToTicks(this.tuning.pulse_cooldown_s);
    const stunnedIds = [];
    const drifterDropEvents = [];
    let shadeScore = 0;

    for (const shade of this.shades) {
      const distance = distanceXZ(this.player.pos, shade.pos);
      if (distance > this.tuning.pulse_radius) continue;
      const wasDraining = shade.state === 'drain';
      let dx = shade.pos[0] - this.player.pos[0];
      let dz = shade.pos[2] - this.player.pos[2];
      const length = Math.hypot(dx, dz);
      if (length === 0) {
        dx = 1;
        dz = 0;
      } else {
        dx /= length;
        dz /= length;
      }
      shade.pos[0] += dx * this.tuning.pulse_push_m;
      shade.pos[2] += dz * this.tuning.pulse_push_m;
      shade.stunTicks = secondsToTicks(this.tuning.pulse_stun_s);
      shade.stateTicksLeft = shade.stunTicks;
      shade.state = 'stunned';
      shade.targetLanternId = null;
      shade.drainTicks = 0;
      stunnedIds.push(shade.id);
      shadeScore += this.usesPhase3 && wasDraining
        ? this.tuning.score.per_drain_stun
        : this.tuning.score.per_stun;
    }

    if (this.usesPhase2) {
      for (const drifter of this.drifters) {
        if (drifter.state === 'removed' || distanceXZ(this.player.pos, drifter.pos) > this.tuning.pulse_radius) continue;
        if (drifter.state === 'chase') {
          drifter.state = 'flee';
          drifter.stateTicksLeft = 240;
          drifter.hasStolen = true;
        } else if (drifter.state === 'flee' && drifter.stolen > 0) {
          const amount = drifter.stolen;
          drifter.stolen = 0;
          drifter.stateTicksLeft = 120;
          for (let index = 0; index < amount; index += 1) {
            this.dropSequence += 1;
            this.motes.push({ id: `D${this.dropSequence}`, pos: copyVec(drifter.pos), kind: 'dropped', ttlTicks: null });
          }
          drifterDropEvents.push({ name: 'drifter_drop', data: { drifter_id: drifter.id, amount } });
        }
      }
    }

    this.score += shadeScore;
    events.push({ name: 'pulse', data: { stunned_ids: stunnedIds } });
    events.push(...drifterDropEvents);
  }

  updateDrifters() {
    for (const drifter of this.drifters) {
      if (drifter.state === 'removed') continue;
      const dx = this.player.pos[0] - drifter.pos[0];
      const dz = this.player.pos[2] - drifter.pos[2];
      const distance = Math.hypot(dx, dz);

      if (drifter.state === 'idle' || drifter.state === 'chase') {
        drifter.state = this.player.carried >= 5 && distance <= 15 ? 'chase' : 'idle';
      }

      let directionX = drifter.idleDirection[0];
      let directionZ = drifter.idleDirection[1];
      let speed = 2;
      if (drifter.state === 'chase' && distance > 0) {
        directionX = dx / distance;
        directionZ = dz / distance;
        speed = 7;
      } else if (drifter.state === 'flee' && distance > 0) {
        directionX = -dx / distance;
        directionZ = -dz / distance;
        speed = 7;
      }
      drifter.pos[0] += (directionX * speed) / TICK_RATE;
      drifter.pos[2] += (directionZ * speed) / TICK_RATE;
    }
  }

  resolveDrifterContacts(events) {
    const candidates = this.drifters
      .filter((drifter) =>
        drifter.state !== 'removed' &&
        drifter.state !== 'flee' &&
        !drifter.hasStolen &&
        this.player.carried > 0 &&
        distanceXZ(this.player.pos, drifter.pos) <= 1.2
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const drifter of candidates) {
      const amount = Math.min(3, this.player.carried);
      if (amount <= 0) break;
      this.player.carried -= amount;
      drifter.stolen = amount;
      drifter.hasStolen = true;
      drifter.state = 'flee';
      drifter.stateTicksLeft = 240;
      events.push({ name: 'drifter_steal', data: { drifter_id: drifter.id, amount, carried: this.player.carried } });
    }
  }

  updateShades(events, resolveContacts = true) {
    if (this.usesPhase3) {
      this.updateShadesPhase3();
      if (resolveContacts) this.resolveShadeContacts(events);
      return;
    }
    for (const shade of this.shades) {
      if (this.usesPhase2 && shade.state === 'spawning') continue;
      if (shade.stunTicks > 0) {
        if (!this.usesPhase2) shade.stunTicks -= 1;
        shade.state = 'stunned';
        continue;
      }

      const dx = this.player.pos[0] - shade.pos[0];
      const dz = this.player.pos[2] - shade.pos[2];
      const length = Math.hypot(dx, dz);
      if (length > 0) {
        shade.pos[0] += (dx / length) * (this.tuning.shade_speed / TICK_RATE);
        shade.pos[2] += (dz / length) * (this.tuning.shade_speed / TICK_RATE);
      }
      shade.state = 'chase';
      this.keepShadeOutsideSafeZones(shade);

      if (
        resolveContacts &&
        this.player.invulnTicks === 0 &&
        distanceXZ(this.player.pos, shade.pos) <= this.tuning.shade_hit_radius
      ) {
        this.hitPlayer(events);
      }
    }
  }

  updateShadesPhase3() {
    for (const shade of this.shades) {
      if (['spawning', 'stunned', 'recoil'].includes(shade.state)) continue;

      if (shade.state === 'drain') {
        if (distanceXZ(shade.pos, this.player.pos) <= 6) {
          shade.state = 'chase';
          shade.targetLanternId = null;
          shade.drainTicks = 0;
        } else {
          const target = this.lanterns.find((lantern) => lantern.id === shade.targetLanternId);
          if (
            !target ||
            !target.lit ||
            target.fuel >= this.tuning.low_fuel_threshold ||
            distanceXZ(shade.pos, target.pos) > 2
          ) {
            shade.state = 'wander';
            shade.targetLanternId = null;
            shade.drainTicks = 0;
          } else {
            continue;
          }
        }
      }

      if (shade.state === 'chase') {
        this.moveShadeToward(shade, this.player.pos);
        this.keepShadeOutsideSafeZones(shade);
        continue;
      }

      const weakLanterns = this.lanterns.filter((lantern) =>
        lantern.lit && lantern.fuel < this.tuning.low_fuel_threshold
      );
      const targets = weakLanterns.length ? weakLanterns : this.lanterns.filter((lantern) => !lantern.lit);
      targets.sort((a, b) => distanceXZ(shade.pos, a.pos) - distanceXZ(shade.pos, b.pos) || a.id.localeCompare(b.id));
      const target = targets[0];
      shade.state = 'wander';
      shade.targetLanternId = target?.id ?? null;
      if (!target) continue;
      this.moveShadeToward(shade, target.pos);
      this.keepShadeOutsideSafeZones(shade);
      if (
        shade.state === 'wander' &&
        target.lit &&
        target.fuel < this.tuning.low_fuel_threshold &&
        distanceXZ(shade.pos, target.pos) <= 2
      ) {
        shade.state = 'drain';
        shade.drainTicks = 0;
      }
    }
  }

  moveShadeToward(shade, targetPos) {
    const dx = targetPos[0] - shade.pos[0];
    const dz = targetPos[2] - shade.pos[2];
    const length = Math.hypot(dx, dz);
    if (length <= 0) return;
    const distance = Math.min(this.tuning.shade_speed / TICK_RATE, length);
    shade.pos[0] += (dx / length) * distance;
    shade.pos[2] += (dz / length) * distance;
  }

  resolveShadeContacts(events) {
    const candidates = [...this.shades]
      .filter((shade) => !['stunned', 'spawning', 'recoil'].includes(shade.state))
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const shade of candidates) {
      if (this.player.invulnTicks > 0) break;
      if (distanceXZ(this.player.pos, shade.pos) <= this.tuning.shade_hit_radius) this.hitPlayer(events);
    }
  }

  keepShadeOutsideSafeZones(shade) {
    for (const lantern of this.lanterns.filter((item) =>
      item.lit && (!this.usesPhase3 || item.fuel >= this.tuning.low_fuel_threshold)
    )) {
      let dx = shade.pos[0] - lantern.pos[0];
      let dz = shade.pos[2] - lantern.pos[2];
      const distance = Math.hypot(dx, dz);
      if (distance >= this.tuning.safe_radius) continue;
      if (distance === 0) {
        dx = 1;
        dz = 0;
      } else {
        dx /= distance;
        dz /= distance;
      }
      shade.pos[0] = lantern.pos[0] + dx * this.tuning.safe_radius;
      shade.pos[2] = lantern.pos[2] + dz * this.tuning.safe_radius;
      shade.state = this.usesPhase2 ? 'recoil' : 'flee';
      if (this.usesPhase3) {
        shade.stateTicksLeft = 30;
        shade.targetLanternId = null;
        shade.drainTicks = 0;
      }
    }
  }

  hitPlayer(events) {
    this.player.flames = Math.max(0, this.player.flames - 1);
    this.player.invulnTicks = secondsToTicks(this.tuning.invuln_s);
    const dropped = Math.floor(this.player.carried * this.tuning.hit_drop_ratio);
    this.player.carried -= dropped;
    for (let index = 0; index < dropped; index += 1) {
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = this.rng.range(this.tuning.pickup_radius + 0.25, this.tuning.pickup_radius + 1.25);
      this.dropSequence += 1;
      this.motes.push({
        id: `D${this.dropSequence}`,
        pos: [
          this.player.pos[0] + Math.cos(angle) * radius,
          0,
          this.player.pos[2] + Math.sin(angle) * radius,
        ],
        kind: 'dropped',
        ttlTicks: Number.isFinite(this.tuning.dropped_mote_ttl_s)
          ? secondsToTicks(this.tuning.dropped_mote_ttl_s)
          : null,
      });
    }
    events.push({ name: 'player_hit', data: { by: 'shade', flames: this.player.flames, dropped } });
  }

  checkTerminal(events) {
    let result = null;
    let reason = null;
    if (this.usesPhase3) {
      if (this.player.flames <= 0) {
        result = 'lost';
        reason = 'no_flames';
      } else if (this.timeLeftS <= 0) {
        const litCount = this.lanterns.filter((lantern) => lantern.lit).length;
        const required = Math.ceil(this.tuning.win_ratio * this.lanterns.length);
        if (litCount >= required) {
          result = 'won';
          reason = 'dawn_survived';
          if (!this.endBonusApplied) {
            for (const lantern of this.lanterns.filter((item) => item.lit)) {
              this.score += this.tuning.score.per_dawn_lantern + Math.floor(lantern.fuel);
            }
            this.score += this.player.flames * this.tuning.score.per_flame_left;
            this.endBonusApplied = true;
          }
        } else {
          result = 'lost';
          reason = 'dawn';
        }
      }
    } else if (this.lanterns.every((lantern) => lantern.lit)) {
      result = 'won';
      reason = 'all_lit';
      if (!this.endBonusApplied) {
        this.score += Math.floor(this.timeLeftS) * this.tuning.score.per_second_left;
        this.score += this.player.flames * this.tuning.score.per_flame_left;
        this.endBonusApplied = true;
      }
    } else if (this.player.flames <= 0) {
      result = 'lost';
      reason = 'no_flames';
    } else if (this.timeLeftS <= 0) {
      result = 'lost';
      reason = 'dawn';
    }

    if (result) {
      this.state = result;
      events.push({ name: 'game_over', data: { result, reason } });
    }
  }

  snapshot() {
    const vec = (value) => value.map(round3);
    const snapshot = {
      type: 'snapshot',
      tick: this.tick,
      sim_tick: this.simTick,
      state: this.outputState,
      time_left_s: round3(this.timeLeftS),
      score: this.score,
      player: {
        pos: vec(this.player.pos),
        flames: this.player.flames,
        carried: this.player.carried,
      },
      lanterns: this.lanterns.map((lantern) => ({
        id: lantern.id,
        pos: vec(lantern.pos),
        lit: lantern.lit,
        deposited: lantern.deposited,
      })),
      shades: this.shades.map((shade) => ({ id: shade.id, pos: vec(shade.pos), state: shade.state })),
      motes_active: this.motes.length,
      motes: this.motes.map((mote) => ({ id: mote.id, pos: vec(mote.pos) })),
    };
    if (this.usesPhase2) {
      snapshot.night = this.night;
      snapshot.wind = { active: this.wind.active, dir_deg: round3(this.wind.dirDeg) };
      snapshot.player.invuln = this.player.invulnTicks > 0;
      snapshot.player.vel = vec([this.player.velocityX, this.player.velocityY, this.player.velocityZ]);
      snapshot.player.grounded = this.player.pos[1] === 0 && this.player.velocityY === 0;
      snapshot.player.dash_cd_s = round3(this.player.dashCooldownTicks / TICK_RATE);
      snapshot.player.pulse_cd_s = round3(this.player.pulseCooldownTicks / TICK_RATE);
      snapshot.player.charm_s = round3(this.player.charmTicks / TICK_RATE);
      snapshot.charms = this.charms.map((charm) => ({
        id: charm.id,
        available: charm.available,
        respawn_s: round3(charm.respawnTicks / TICK_RATE),
      }));
      snapshot.drifters = this.drifters
        .filter((drifter) => drifter.state !== 'removed')
        .map((drifter) => ({
          id: drifter.id,
          pos: vec(drifter.pos),
          state: drifter.state,
          stolen: drifter.stolen,
        }));
      snapshot.motes = this.motes.map((mote) => ({
        id: mote.id,
        pos: vec(mote.pos),
        kind: mote.kind ?? 'random',
        ttl_s: mote.ttlTicks === null ? null : round3(mote.ttlTicks / TICK_RATE),
      }));
    }
    if (this.usesPhase3) {
      snapshot.player.capacity = this.capacity;
      snapshot.lanterns = this.lanterns.map((lantern) => ({
        id: lantern.id,
        pos: vec(lantern.pos),
        lit: lantern.lit,
        deposited: lantern.deposited,
        fuel: lantern.lit ? round1(lantern.fuel) : 0,
        ever_lit: lantern.everLit,
        relit_count: lantern.relitCount,
      }));
    }
    return snapshot;
  }
}

import { SeededRng } from './rng.js';

export const TICK_RATE = 60;
export const ISLAND_RADIUS = 38;
export const JUMP_SPEED = 7;
export const GRAVITY = 18;

const copyVec = (value) => value.map(Number);
const distanceXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const secondsToTicks = (seconds) => Math.round(seconds * TICK_RATE);
const round3 = (value) => Math.round((value + Number.EPSILON) * 1000) / 1000;

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
  }));
}

function defaultShades(rng) {
  return Array.from({ length: 3 }, (_, index) => ({
    id: `S${index + 1}`,
    pos: randomGroundPosition(rng, 18, 33),
    state: 'chase',
    stunTicks: 0,
  }));
}

/** Deterministic gameplay core; rendering and wall-clock time stay outside. */
export class Simulation {
  constructor({ seed = 1, tuning, scenario = {} }) {
    assert(tuning && typeof tuning === 'object', 'tuning is required');
    assert(scenario && typeof scenario === 'object' && !Array.isArray(scenario), 'scenario must be an object');

    this.tuning = structuredClone(tuning);
    this.rng = new SeededRng(seed);
    this.seed = Number(seed);
    this.tick = 0;
    this.simTick = 0;
    this.state = 'playing';
    this.paused = false;
    this.score = 0;
    this.endBonusApplied = false;
    this.dropSequence = 0;
    this.inputPrevious = { jump: false, interact: false, pulse: false, dash: false, pause: false };
    this.player = {
      pos: [0, 0, 0],
      velocityY: 0,
      carried: 0,
      flames: tuning.flames,
      invulnTicks: 0,
      pulseCooldownTicks: 0,
    };
    this.lanterns = defaultLanterns(tuning.lantern_count_night1);
    this.motes = defaultMotes(this.rng);
    this.shades = defaultShades(this.rng);
    this.initialDurationS = tuning.night1_duration_s;

    this.applyScenario(scenario);
  }

  applyScenario(scenario) {
    const allowedScenarioFields = new Set([
      'player', 'random_motes', 'random_shades', 'motes', 'shades', 'lanterns', 'time_left_s'
    ]);
    for (const field of Object.keys(scenario)) {
      assert(allowedScenarioFields.has(field), `unknown scenario field: ${field}`);
    }
    for (const flag of ['random_motes', 'random_shades']) {
      if (scenario[flag] !== undefined) assert(typeof scenario[flag] === 'boolean', `${flag} must be boolean`);
    }
    if (scenario.player !== undefined) {
      assert(scenario.player && typeof scenario.player === 'object', 'scenario.player must be an object');
      for (const field of Object.keys(scenario.player)) {
        assert(['pos', 'carried', 'flames'].includes(field), `unknown player field: ${field}`);
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
    }

    if (scenario.time_left_s !== undefined) {
      assert(Number.isFinite(scenario.time_left_s) && scenario.time_left_s >= 0, 'time_left_s must be a non-negative number');
      this.initialDurationS = scenario.time_left_s;
    }

    if (scenario.motes !== undefined) {
      assert(Array.isArray(scenario.motes), 'scenario.motes must be an array');
      this.motes = scenario.motes.map((pos, index) => {
        validateVec(pos, `scenario.motes[${index}]`);
        return { id: `M${index + 1}`, pos: copyVec(pos) };
      });
    } else if (scenario.random_motes === false) {
      this.motes = [];
    }

    if (scenario.shades !== undefined) {
      assert(Array.isArray(scenario.shades), 'scenario.shades must be an array');
      const ids = new Set();
      this.shades = scenario.shades.map((shade, index) => {
        assert(shade && typeof shade === 'object', `scenario.shades[${index}] must be an object`);
        for (const field of Object.keys(shade)) {
          assert(['id', 'pos'].includes(field), `unknown shade field: ${field}`);
        }
        validateVec(shade.pos, `scenario.shades[${index}].pos`);
        const id = shade.id ?? `S${index + 1}`;
        assert(typeof id === 'string' && id.length > 0 && !ids.has(id), 'shade ids must be unique non-empty strings');
        ids.add(id);
        return { id, pos: copyVec(shade.pos), state: 'chase', stunTicks: 0 };
      });
    } else if (scenario.random_shades === false) {
      this.shades = [];
    }

    if (scenario.lanterns !== undefined) {
      assert(Array.isArray(scenario.lanterns), 'scenario.lanterns must be an array');
      for (const update of scenario.lanterns) {
        assert(update && typeof update === 'object', 'each lantern update must be an object');
        for (const field of Object.keys(update)) {
          assert(['id', 'pos', 'deposited', 'lit'].includes(field), `unknown lantern field: ${field}`);
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
      }
    }
  }

  get timeLeftS() {
    return Math.max(0, this.initialDurationS - this.simTick / TICK_RATE);
  }

  get outputState() {
    return this.paused ? 'paused' : this.state;
  }

  step(input = {}) {
    if (this.state !== 'playing') return [];

    const events = [];
    if (this.player.invulnTicks > 0) this.player.invulnTicks -= 1;
    if (this.player.pulseCooldownTicks > 0) this.player.pulseCooldownTicks -= 1;

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

    this.movePlayer(current, rising('jump'));
    this.collectMotes(events);
    if (rising('interact')) this.interact(events);
    if (rising('pulse')) this.pulse(events);
    this.updateShades(events);

    this.simTick += 1;
    this.tick += 1;
    this.inputPrevious = current;
    this.checkTerminal(events);
    return events;
  }

  movePlayer(input, jump) {
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
    this.player.pos[0] += (worldX * this.tuning.player_speed) / TICK_RATE;
    this.player.pos[2] += (worldZ * this.tuning.player_speed) / TICK_RATE;

    const groundRadius = Math.hypot(this.player.pos[0], this.player.pos[2]);
    if (!this.tuning.fall_enabled && groundRadius > ISLAND_RADIUS) {
      this.player.pos[0] = (this.player.pos[0] / groundRadius) * ISLAND_RADIUS;
      this.player.pos[2] = (this.player.pos[2] / groundRadius) * ISLAND_RADIUS;
    }

    if (jump && this.player.pos[1] <= 0) this.player.velocityY = JUMP_SPEED;
    this.player.velocityY -= GRAVITY / TICK_RATE;
    this.player.pos[1] += this.player.velocityY / TICK_RATE;
    if (this.player.pos[1] <= 0) {
      this.player.pos[1] = 0;
      this.player.velocityY = 0;
    }
  }

  collectMotes(events) {
    const remaining = [];
    for (const mote of this.motes) {
      if (
        this.player.carried < this.tuning.carry_capacity &&
        distanceXZ(this.player.pos, mote.pos) <= this.tuning.pickup_radius
      ) {
        this.player.carried += 1;
        this.score += this.tuning.score.per_mote;
        events.push({ name: 'mote_picked', data: { carried: this.player.carried } });
      } else {
        remaining.push(mote);
      }
    }
    this.motes = remaining;
  }

  interact(events) {
    const candidates = this.lanterns
      .filter((lantern) => !lantern.lit && distanceXZ(this.player.pos, lantern.pos) <= this.tuning.interact_radius)
      .sort((a, b) => distanceXZ(this.player.pos, a.pos) - distanceXZ(this.player.pos, b.pos) || a.id.localeCompare(b.id));
    const lantern = candidates[0];
    if (!lantern || this.player.carried <= 0) return;

    const amount = Math.min(this.player.carried, this.tuning.lantern_cost - lantern.deposited);
    if (amount <= 0) return;
    this.player.carried -= amount;
    lantern.deposited += amount;
    events.push({ name: 'deposit', data: { lantern_id: lantern.id, amount, deposited: lantern.deposited } });
    if (lantern.deposited >= this.tuning.lantern_cost) {
      lantern.lit = true;
      this.score += this.tuning.score.per_lantern;
      events.push({ name: 'lantern_lit', data: { lantern_id: lantern.id } });
    }
  }

  pulse(events) {
    if (this.player.carried < this.tuning.pulse_cost || this.player.pulseCooldownTicks > 0) return;
    this.player.carried -= this.tuning.pulse_cost;
    this.player.pulseCooldownTicks = secondsToTicks(this.tuning.pulse_cooldown_s);
    const stunnedIds = [];

    for (const shade of this.shades) {
      const distance = distanceXZ(this.player.pos, shade.pos);
      if (distance > this.tuning.pulse_radius) continue;
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
      shade.state = 'stunned';
      stunnedIds.push(shade.id);
    }

    this.score += stunnedIds.length * this.tuning.score.per_stun;
    events.push({ name: 'pulse', data: { stunned_ids: stunnedIds } });
  }

  updateShades(events) {
    for (const shade of this.shades) {
      if (shade.stunTicks > 0) {
        shade.stunTicks -= 1;
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
        this.player.invulnTicks === 0 &&
        distanceXZ(this.player.pos, shade.pos) <= this.tuning.shade_hit_radius
      ) {
        this.hitPlayer(events);
      }
    }
  }

  keepShadeOutsideSafeZones(shade) {
    for (const lantern of this.lanterns.filter((item) => item.lit)) {
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
      shade.state = 'flee';
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
      });
    }
    events.push({ name: 'player_hit', data: { by: 'shade', flames: this.player.flames, dropped } });
  }

  checkTerminal(events) {
    let result = null;
    let reason = null;
    if (this.lanterns.every((lantern) => lantern.lit)) {
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
    return {
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
  }
}

// Input state persists between sparse frames exactly as Test Contract v1.0 defines.
const BOOLEAN_FIELDS = ['jump', 'interact', 'pulse', 'dash'];
const ALLOWED_FIELDS = new Set(['tick', 'move', 'cam_yaw_deg', ...BOOLEAN_FIELDS]);

function fail(message) {
  throw new Error(message);
}

export function validateInputs(inputDocument = { frames: [] }) {
  if (!inputDocument || typeof inputDocument !== 'object' || !Array.isArray(inputDocument.frames)) {
    fail('inputs must be an object with a frames array');
  }

  let previousTick = -1;
  for (const [index, frame] of inputDocument.frames.entries()) {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) fail(`frames[${index}] must be an object`);
    for (const field of Object.keys(frame)) {
      if (!ALLOWED_FIELDS.has(field)) fail(`frames[${index}] has unknown field: ${field}`);
    }
    if (!Number.isInteger(frame.tick) || frame.tick < 0 || frame.tick <= previousTick) {
      fail('frame ticks must be non-negative and strictly increasing');
    }
    previousTick = frame.tick;
    if (frame.move !== undefined) {
      if (!Array.isArray(frame.move) || frame.move.length !== 2 || !frame.move.every(Number.isFinite)) {
        fail(`frames[${index}].move must be [x, z]`);
      }
      if (frame.move.some((value) => value < -1 || value > 1)) fail(`frames[${index}].move values must be in [-1, 1]`);
    }
    if (frame.cam_yaw_deg !== undefined && !Number.isFinite(frame.cam_yaw_deg)) {
      fail(`frames[${index}].cam_yaw_deg must be a number`);
    }
    for (const field of BOOLEAN_FIELDS) {
      if (frame[field] !== undefined && typeof frame[field] !== 'boolean') {
        fail(`frames[${index}].${field} must be boolean`);
      }
    }
  }
  return inputDocument.frames;
}

export class InputTimeline {
  constructor(frames) {
    this.frames = frames;
    this.index = 0;
    this.current = {
      move: [0, 0],
      cam_yaw_deg: 0,
      jump: false,
      interact: false,
      pulse: false,
      dash: false,
    };
  }

  at(tick) {
    while (this.index < this.frames.length && this.frames[this.index].tick === tick) {
      const { tick: ignored, ...changes } = this.frames[this.index];
      Object.assign(this.current, changes);
      this.index += 1;
    }
    return this.current;
  }
}

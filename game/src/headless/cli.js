#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Simulation } from '../core/simulation.js';
import { InputTimeline, validateInputs } from './inputs.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error('arguments must be --name value pairs');
    args[key.slice(2)] = value;
  }
  for (const required of ['seed', 'night', 'ticks', 'out']) {
    if (args[required] === undefined) throw new Error(`missing --${required}`);
  }
  const parsed = {
    seed: Number(args.seed),
    night: Number(args.night),
    ticks: Number(args.ticks),
    out: args.out,
    scenario: args.scenario,
    inputs: args.inputs,
    snapshotEvery: args['snapshot-every'] === undefined ? 10 : Number(args['snapshot-every']),
  };
  if (!Number.isInteger(parsed.seed)) throw new Error('--seed must be an integer');
  if (parsed.night !== 1) throw new Error('Phase 1 supports only --night 1');
  if (!Number.isInteger(parsed.ticks) || parsed.ticks < 0) throw new Error('--ticks must be a non-negative integer');
  if (!Number.isInteger(parsed.snapshotEvery) || parsed.snapshotEvery <= 0) {
    throw new Error('--snapshot-every must be a positive integer');
  }
  return parsed;
}

async function readJson(path, label, fallback) {
  if (!path) return fallback;
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

export async function run(argv) {
  const args = parseArgs(argv);
  const contract = JSON.parse(await readFile(resolve(repoRoot, 'game.contract.json'), 'utf8'));
  const scenario = await readJson(args.scenario, 'invalid scenario file', {});
  const inputDocument = await readJson(args.inputs, 'invalid inputs file', { frames: [] });
  const frames = validateInputs(inputDocument);
  const timeline = new InputTimeline(frames);
  const simulation = new Simulation({ seed: args.seed, tuning: contract.tuning, scenario });
  const records = [simulation.snapshot()];

  for (let step = 0; step < args.ticks && simulation.state === 'playing'; step += 1) {
    const events = simulation.step(timeline.at(simulation.tick));
    for (const event of events) {
      records.push({ type: 'event', tick: simulation.tick, name: event.name, data: event.data });
    }
    if (simulation.tick % args.snapshotEvery === 0) records.push(simulation.snapshot());
  }

  records.push({ type: 'end', ticks: simulation.tick, state: simulation.state, score: simulation.score });
  const output = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
  await mkdir(dirname(resolve(args.out)), { recursive: true });
  await writeFile(args.out, output, 'utf8');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}

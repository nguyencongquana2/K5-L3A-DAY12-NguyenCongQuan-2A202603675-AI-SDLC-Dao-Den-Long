#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Simulation } from '../core/simulation.js';
import { SeededRng } from '../core/rng.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error('arguments must be --name value pairs');
    args[key.slice(2)] = value;
  }
  const seed = Number(args.seed);
  const nights = Number(args.nights);
  if (!Number.isInteger(seed)) throw new Error('--seed must be an integer');
  if (!Number.isInteger(nights) || nights <= 0) throw new Error('--nights must be a positive integer');
  if (!args.out) throw new Error('missing --out');
  return { seed, nights, out: args.out };
}

const memoryMb = () => Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10;

export async function run(argv) {
  const args = parseArgs(argv);
  const contract = JSON.parse(await readFile(resolve(repoRoot, 'game.contract.json'), 'utf8'));
  const started = performance.now();
  const results = [];
  let crashes = 0;
  let simulation = new Simulation({
    seed: args.seed,
    tuning: contract.tuning,
    contractVersion: contract.contract_version,
    night: 1,
  });
  globalThis.gc?.();
  const memStartMb = memoryMb();

  for (let index = 0; index < args.nights; index += 1) {
    const night = (index % 3) + 1;
    const nightSeed = args.seed + index;
    try {
      if (index > 0) {
        simulation = new Simulation({
          seed: nightSeed,
          tuning: contract.tuning,
          contractVersion: contract.contract_version,
          night,
        });
      }
      const inputRng = new SeededRng(nightSeed);
      let move = [0, 0];
      const maxTicks = contract.tuning[`night${night}_duration_s`] * 60 + 1;
      for (let tick = 0; tick < maxTicks && simulation.state === 'playing'; tick += 1) {
        if (tick % 30 === 0) {
          const angle = inputRng.range(0, Math.PI * 2);
          move = [Math.cos(angle), Math.sin(angle)];
        }
        simulation.step({
          move,
          jump: inputRng.next() < 0.05,
          dash: inputRng.next() < 0.03,
          pulse: inputRng.next() < 0.02,
          interact: inputRng.next() < 0.1,
        });
      }
      results.push(simulation.state === 'won' ? 'won' : 'lost');
    } catch (error) {
      crashes += 1;
      results.push('crashed');
      console.error(`night ${index + 1}: ${error.message}`);
    }
  }

  simulation = null;
  globalThis.gc?.();
  const output = {
    nights: args.nights,
    crashes,
    results,
    mem_start_mb: memStartMb,
    mem_end_mb: memoryMb(),
    duration_s: Math.round(((performance.now() - started) / 1000) * 10) / 10,
  };
  await mkdir(dirname(resolve(args.out)), { recursive: true });
  await writeFile(resolve(args.out), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(output));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}

#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { normalizeLeaderboard } from '../core/leaderboard.js';

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const storagePath = resolve(gameRoot, '.local/leaderboard.json');

async function readEntries() {
  try {
    const document = JSON.parse(await readFile(storagePath, 'utf8'));
    return normalizeLeaderboard(document.entries);
  } catch {
    return [];
  }
}

async function writeEntries(entries) {
  const normalized = normalizeLeaderboard(entries);
  await mkdir(resolve(gameRoot, '.local'), { recursive: true });
  await writeFile(storagePath, `${JSON.stringify({ entries: normalized }, null, 2)}\n`, 'utf8');
  return normalized;
}

async function handleLeaderboardRequest(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (request.method === 'GET') {
    response.end(JSON.stringify({ entries: await readEntries() }));
    return;
  }
  if (request.method === 'POST') {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', async () => {
      try {
        const document = JSON.parse(body);
        response.end(JSON.stringify({ entries: await writeEntries(document.entries) }));
      } catch (error) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }
  response.statusCode = 405;
  response.end(JSON.stringify({ error: 'method not allowed' }));
}

const leaderboardPlugin = {
  name: 'local-leaderboard-api',
  configureServer(server) {
    server.middlewares.use('/api/leaderboard', handleLeaderboardRequest);
  },
};

async function exportLeaderboard(outputPath) {
  let entries = [];
  try {
    const document = JSON.parse(await readFile(storagePath, 'utf8'));
    entries = normalizeLeaderboard(document.entries);
  } catch {
    // A fresh install exports an empty leaderboard.
  }
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(resolve(outputPath), `${JSON.stringify({ entries }, null, 2)}\n`, 'utf8');
  console.log(`Exported ${entries.length} leaderboard entries to ${resolve(outputPath)}`);
}

export async function run(argv) {
  if (argv[0] === '--export-leaderboard') {
    if (!argv[1] || argv.length !== 2) throw new Error('usage: --export-leaderboard out.json');
    await exportLeaderboard(argv[1]);
    return;
  }
  if (argv.length) throw new Error(`unknown argument: ${argv[0]}`);
  const server = await createServer({ root: gameRoot, configFile: false, plugins: [leaderboardPlugin] });
  await server.listen();
  server.printUrls();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}

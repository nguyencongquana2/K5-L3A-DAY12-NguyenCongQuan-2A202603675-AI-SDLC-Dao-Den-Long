#!/usr/bin/env node
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error('arguments must be --name value pairs');
    args[key.slice(2)] = value;
  }
  const seed = Number(args.seed);
  const duration = Number(args.duration);
  if (!Number.isInteger(seed)) throw new Error('--seed must be an integer');
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('--duration must be positive');
  if (!args.out) throw new Error('missing --out');
  return { seed, duration, out: args.out, screenshot: args.screenshot };
}

export async function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next standard browser location.
    }
  }
  throw new Error('Chrome or Edge was not found; set CHROME_PATH to the browser executable');
}

export async function waitForUrl(url, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Server/browser is still starting.
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for ${url}`);
}

export async function connectCdp(debugPort, urlPattern = 'benchmark') {
  const response = await waitForUrl(`http://127.0.0.1:${debugPort}/json`);
  const pages = await response.json();
  const page = pages.find((item) => item.type === 'page' && item.url.includes(urlPattern));
  if (!page) throw new Error(`browser page containing ${urlPattern} was not created`);
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const handlers = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handlers.reject(new Error(message.error.message));
    else handlers.resolve(message.result);
  });
  const call = (method, params = {}) => {
    nextId += 1;
    socket.send(JSON.stringify({ id: nextId, method, params }));
    return new Promise((resolveCall, reject) => pending.set(nextId, { resolve: resolveCall, reject }));
  };
  return { socket, call };
}

export async function run(argv) {
  const args = parseArgs(argv);
  const processStartedAt = Date.now();
  const browserPath = await findBrowser();
  const port = 4174;
  const debugPort = 9224;
  const profileDirectory = await mkdtemp(resolve(tmpdir(), 'dao-den-long-bench-'));
  const vitePath = resolve(gameRoot, 'node_modules/vite/bin/vite.js');
  const server = spawn(process.execPath, [vitePath, '--host', '127.0.0.1', '--port', String(port)], {
    cwd: gameRoot,
    stdio: 'ignore',
    windowsHide: true,
  });
  let browser;
  let cdp;
  try {
    await waitForUrl(`http://127.0.0.1:${port}`);
    const url = `http://127.0.0.1:${port}/?benchmark=1&seed=${args.seed}&duration=${args.duration}`;
    browser = spawn(browserPath, [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profileDirectory}`,
      '--window-size=1280,720',
      '--window-position=0,0',
      '--no-first-run',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-frame-rate-limit',
      '--disable-gpu-vsync',
      url,
    ], { stdio: 'ignore', windowsHide: false });
    cdp = await connectCdp(debugPort);
    await cdp.call('Runtime.enable');
    await cdp.call('Page.enable');
    await cdp.call('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.call('Page.reload', { ignoreCache: true });

    let pageResult = null;
    const deadline = Date.now() + (args.duration + 20) * 1000;
    while (Date.now() < deadline) {
      const evaluated = await cdp.call('Runtime.evaluate', {
        expression: 'document.body.dataset.benchmarkResult || null',
        returnByValue: true,
      });
      if (evaluated.result.value) {
        pageResult = JSON.parse(evaluated.result.value);
        break;
      }
      await delay(100);
    }
    if (!pageResult) throw new Error('benchmark page did not finish before the timeout');
    const output = {
      contract_version: '1.3',
      avg_fps: pageResult.avg_fps,
      p1_low_fps: pageResult.p1_low_fps,
      frame_ms_p95: pageResult.frame_ms_p95,
      frames: pageResult.frames,
      load_ms: Math.max(0, pageResult.first_frame_epoch_ms - processStartedAt),
      peak_mem_mb: null,
      vsync_off: true,
      renderer: pageResult.renderer,
      os: pageResult.os,
    };
    await mkdir(dirname(resolve(args.out)), { recursive: true });
    await writeFile(resolve(args.out), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    if (args.screenshot) {
      const screenshot = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await mkdir(dirname(resolve(args.screenshot)), { recursive: true });
      await writeFile(resolve(args.screenshot), Buffer.from(screenshot.data, 'base64'));
    }
    console.log(JSON.stringify(output));
  } finally {
    try { await cdp?.call('Browser.close'); } catch { browser?.kill(); }
    server.kill();
    await delay(250);
    await rm(profileDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}

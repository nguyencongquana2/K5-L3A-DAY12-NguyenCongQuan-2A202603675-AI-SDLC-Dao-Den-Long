import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pages = await fetch('http://127.0.0.1:9223/json').then((response) => response.json());
const page = pages.find((item) => item.type === 'page' && item.url.includes('benchmark'));
assert.ok(page, 'benchmark page is not open on Chrome debug port 9223');

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
  const { resolve: resolveCall, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolveCall(message.result);
});

function call(method, params = {}) {
  nextId += 1;
  socket.send(JSON.stringify({ id: nextId, method, params }));
  return new Promise((resolveCall, reject) => pending.set(nextId, { resolve: resolveCall, reject }));
}

await call('Runtime.enable');
await call('Page.enable');
await call('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 720,
  deviceScaleFactor: 1,
  mobile: false,
});
await call('Page.reload', { ignoreCache: true });
await new Promise((resolveWait) => setTimeout(resolveWait, 500));
let metrics;
for (let attempt = 0; attempt < 40; attempt += 1) {
  const result = await call('Runtime.evaluate', {
    expression: '({ fps: Number(document.body.dataset.benchmarkFps || 0), width: innerWidth, height: innerHeight })',
    returnByValue: true,
  });
  metrics = result.result.value;
  if (metrics.fps > 0) break;
  await new Promise((resolveWait) => setTimeout(resolveWait, 250));
}

assert.ok(metrics.fps >= 30, `browser averaged ${metrics.fps} FPS, below 30`);
const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
const gameRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const proofDirectory = resolve(gameRoot, 'docs/proof/phase-2');
await mkdir(proofDirectory, { recursive: true });
await writeFile(resolve(proofDirectory, 'browser-1280x720.png'), Buffer.from(screenshot.data, 'base64'));
console.log(`Browser proof verified: ${metrics.fps.toFixed(2)} FPS at ${metrics.width}×${metrics.height}.`);
socket.close();

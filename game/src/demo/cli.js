#!/usr/bin/env node
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { connectCdp, delay, findBrowser, waitForUrl } from '../bench/cli.js';

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || argv[index + 1] === undefined) throw new Error('arguments must be --name value pairs');
    args[argv[index].slice(2)] = argv[index + 1];
  }
  const duration = Number(args.duration ?? 18);
  if (!Number.isFinite(duration) || duration <= 0 || duration >= 300) throw new Error('--duration must be between 0 and 300 seconds');
  if (!args.out?.toLowerCase().endsWith('.mp4')) throw new Error('--out must be an .mp4 path');
  return { duration, out: resolve(args.out) };
}

const key = (call, type, code) => call('Input.dispatchKeyEvent', {
  type,
  code,
  key: code.replace(/^Key/, ''),
  windowsVirtualKeyCode: code.startsWith('Key') ? code.charCodeAt(3) : 0,
});

export async function run(argv) {
  const args = parseArgs(argv);
  const browserPath = await findBrowser();
  const profileDirectory = await mkdtemp(resolve(tmpdir(), 'dao-den-long-demo-'));
  const port = 4175;
  const debugPort = 9225;
  const vitePath = resolve(gameRoot, 'node_modules/vite/bin/vite.js');
  const server = spawn(process.execPath, [vitePath, '--host', '127.0.0.1', '--port', String(port)], {
    cwd: gameRoot,
    stdio: 'ignore',
    windowsHide: true,
  });
  let browser;
  let cdp;
  try {
    await mkdir(dirname(args.out), { recursive: true });
    await waitForUrl(`http://127.0.0.1:${port}`);
    browser = spawn(browserPath, [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profileDirectory}`,
      '--window-size=1280,720',
      '--window-position=0,0',
      '--no-first-run',
      '--disable-extensions',
      `http://127.0.0.1:${port}/?autostart=1`,
    ], { stdio: 'ignore', windowsHide: false });
    cdp = await connectCdp(debugPort, 'autostart');
    await cdp.call('Runtime.enable');
    await cdp.call('Page.enable');
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await cdp.call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dirname(args.out) });
    await cdp.call('Page.reload', { ignoreCache: true });
    await delay(1500);
    const support = await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const types = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4'];
        return types.find((type) => MediaRecorder.isTypeSupported(type)) || null;
      })()`,
      returnByValue: true,
    });
    const mimeType = support.result.value;
    if (!mimeType) throw new Error('this Chrome/Edge build cannot encode MP4 with MediaRecorder');
    await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const stream = document.querySelector('#game').captureStream(30);
        const chunks = [];
        const recorder = new MediaRecorder(stream, { mimeType: ${JSON.stringify(mimeType)}, videoBitsPerSecond: 6000000 });
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        recorder.onstop = () => {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
          link.download = ${JSON.stringify(args.out.split(/[\\/]/).at(-1))};
          link.click();
          document.body.dataset.demoRecorded = 'true';
        };
        recorder.start(1000);
        window.__demoRecorder = recorder;
      })()`,
    });

    await key(cdp.call, 'keyDown', 'KeyW');
    await delay(2200);
    await key(cdp.call, 'keyUp', 'KeyW');
    await key(cdp.call, 'keyDown', 'ShiftLeft');
    await delay(300);
    await key(cdp.call, 'keyUp', 'ShiftLeft');
    await key(cdp.call, 'keyDown', 'KeyW');
    await delay(2000);
    await key(cdp.call, 'keyUp', 'KeyW');
    await key(cdp.call, 'keyDown', 'KeyE');
    await delay(200);
    await key(cdp.call, 'keyUp', 'KeyE');
    await key(cdp.call, 'keyDown', 'KeyQ');
    await delay(200);
    await key(cdp.call, 'keyUp', 'KeyQ');
    await delay(Math.max(0, args.duration * 1000 - 4900));
    await cdp.call('Runtime.evaluate', { expression: 'window.__demoRecorder.stop()' });

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try {
        await access(args.out);
        console.log(`Recorded ${args.out}`);
        return;
      } catch {
        await delay(250);
      }
    }
    throw new Error('MP4 download did not complete');
  } finally {
    try { await cdp?.call('Browser.close'); } catch { browser?.kill(); }
    server.kill();
    await delay(1000);
    try {
      await rm(profileDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
    } catch (error) {
      console.warn(`temporary Chrome profile cleanup deferred: ${error.message}`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}

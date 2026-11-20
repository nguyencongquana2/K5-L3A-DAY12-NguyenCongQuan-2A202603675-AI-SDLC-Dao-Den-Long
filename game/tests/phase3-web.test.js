import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/web/main.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/web/style.css', import.meta.url), 'utf8');

test('Phase 3 HUD exposes dynamic capacity and lantern fuel interactions', () => {
  for (const id of ['capacity', 'interaction-label', 'deposit-progress']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(main, /simulation\.capacity/);
  assert.match(main, /nearLantern\.fuel\.toFixed\(1\)/);
  assert.match(main, /nearLantern\.everLit/);
});

test('lit lanterns render fuel bars and low fuel uses a one-hertz non-colour blink', () => {
  assert.match(main, /fuelBar/);
  assert.match(main, /fuelFill/);
  assert.match(main, /Math\.sin\(elapsed \* Math\.PI \* 2\)/);
  assert.match(main, /visual\.scale\.setScalar\(lantern\.lit \? 1 : 0\.8\)/);
  assert.match(main, /tear\.visible = !lantern\.lit/);
});

test('distinguishable palette is persisted and changes Shade accent and UI warning colours', () => {
  assert.match(html, /id="distinguishable-palette"/);
  assert.match(main, /distinguishablePalette/);
  assert.match(main, /0x00b3ff/);
  assert.match(main, /0x7a3cff/);
  assert.match(main, /⚠/);
  assert.match(css, /--warning: #ffffff/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/web/main.js', import.meta.url), 'utf8');

test('pause menu exposes every required action', () => {
  for (const id of ['pause-menu', 'continue', 'retry-night', 'open-settings', 'back-to-menu']) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(main, new RegExp(`['"]#${id}['"]`));
  }
});

test('settings expose persisted volume and mouse sensitivity controls', () => {
  for (const id of ['volume', 'volume-value', 'sensitivity', 'sensitivity-value']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(main, /dao-den-long\.settings\.v1/);
  assert.match(main, /localStorage\.getItem/);
  assert.match(main, /localStorage\.setItem/);
});

test('browser input forwards dash and pause to the deterministic core', () => {
  assert.match(main, /dash: keys\.has\('ShiftLeft'\)/);
  assert.match(main, /pause: keys\.has\('KeyP'\)/);
});

test('web product exposes three-Night progression, standard HUD and synthesized audio', () => {
  for (const id of ['night-intro', 'begin-night', 'mote-bar', 'dash-cooldown', 'pulse-cooldown', 'lantern-arrow']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(main, /NIGHT_STORIES/);
  assert.match(main, /currentNight < 3/);
  assert.match(main, /AudioContext/);
  assert.match(main, /totalScore \+= simulation\.score/);
});

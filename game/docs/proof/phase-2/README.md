# Phase 2 proof

- `performance-night3.jsonl`: full 21,600-tick Night 3 run; measured at 0.096 seconds on 2026-11-20.
- `determinism-a.jsonl` and `determinism-b.jsonl`: identical runs using seed 2026 and the Phase 2 performance scenario.
- Automated suite: 51 tests covering pause, dash, charm, drifter, wind, terrain, falling, launch pads, schedules, scoring, scenario/snapshot schema and web wiring.
- Production build: Vite build passes.
- `browser-1280x720.png`: Chrome/D3D11 browser proof captured at an average 119.32 FPS with the viewport forced to exactly 1280×720.

The browser measurement samples `requestAnimationFrame` for three seconds after the normal game build autostarts. `scripts/capture-browser-proof.js` reads the result and captures the screenshot over the Chrome DevTools Protocol.

# Phase 4 technical notes

Contract: v1.3 · Release target: v1.0.0 · Date: 2026-11-20

## Measurement isolation

Benchmark mode is an explicit simulation mode rather than a scenario gameplay flag. It advances only existing Shade `wander` behavior and fixed ticks. Collection, damage, fuel decay, scheduled spawns, player actions and terminal checks do not run. The browser constructs exactly 200 seeded Shades, 100 seeded motes and three full lit lanterns, and uses the prescribed orbit camera. This keeps creative gameplay entities out without changing ordinary headless output.

The browser CLI starts Vite and Chrome/Edge, forces a 1280×720 viewport through CDP, warms for three seconds and calculates all metrics from individual `requestAnimationFrame` deltas. Chrome receives frame-limit/vsync disable flags. `peak_mem_mb` is `null` because a portable web page cannot attribute operating-system RSS across the multi-process browser; the contract explicitly permits this with an explanation.

Soak input uses its own seeded RNG and creates each Night in the same Node.js process. The memory endpoints use process RSS; `--expose-gc` removes unreferenced Night state before the final reading without changing gameplay.

## Product decisions

- The source launcher hosts a tiny local leaderboard API and persists `game/.local/leaderboard.json`; static builds retain the same Top 10 in browser `localStorage`.
- Leaderboard normalization is shared by browser, API and export CLI, so validation and ordering cannot drift.
- Key bindings are state-based, unique across all nine actions and persisted with other accessibility settings.
- Reduced motion disables warning blinking and CSS animation. The game has no camera shake or full-screen flash; the option guarantees future/current animated warnings do not introduce them.
- UI root size is 18 px at 1280×720; large text changes the root to 22.5 px.

## Compatibility

Contract branches v1.0–v1.2 remain executable and all still-valid regression tests run. v1.3 adds release tooling and benchmark isolation without changing ordinary simulation ordering or snapshots.

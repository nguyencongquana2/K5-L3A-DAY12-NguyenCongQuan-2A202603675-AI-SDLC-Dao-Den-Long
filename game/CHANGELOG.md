# Changelog

Project code and generated documentation live under `game/`.

## Phase 4 — v1.0.0 release

- Upgraded Test Contract to v1.3 with reproducible browser benchmark and ten-Night same-process soak commands.
- Added persistent local Top 10 leaderboard, menu screen, validated player names and JSON export.
- Added remappable controls with conflict detection, reduced motion, large text and required visual warnings.
- Added clean-install instructions, release packaging, complete evidence, four-phase retro and release documentation.

## Phase 3 — breaking changes

- Upgraded the public Test Contract from v1.1 to v1.2 and changed Night durations to 240/270/300 seconds.
- Replaced permanent lantern light with deterministic fuel, refuelling, outage, relighting and lantern history fields.
- Removed the `all_lit` early win. Nights now resolve only at dawn using the 60% lit-lantern threshold; the new win reason is `dawn_survived`.
- Replaced Phase 2 scoring for v1.2 with deposited-fuel, first-light, relight, drain-stun and dawn bonuses. Legacy score keys remain only so explicit v1.0/v1.1 regression runs can reproduce their historical rules.
- Added the Shade `drain` state, weak-lantern targeting, cumulative fuel drain and periodic `fuel_drain` evidence events.
- Added growing carry capacity, the `refuel` and `lantern_out` events, and v1.2 snapshot/scenario fields.
- Added a persisted distinguishable palette and shape/tear/blink cues that do not rely on colour alone.

## Phase 2

- Expanded the game to three Nights with deterministic terrain, schedules, wind, dash, Gió Lạc and Bùa Gió.
- Added pause semantics, dynamic entities, standardized score, scenario/snapshot v1.1 fields and a complete browser shell.
- Added performance, deterministic and browser evidence while retaining Phase 1 behavior.

## Phase 1

- Added deterministic 60 Hz gameplay simulation and Test Contract v1.0 CLI.
- Added Night 1 mechanics: movement, jump, motes, lantern deposits, shades, pulse, safe zones, win/loss, scoring, and replay.
- Added a procedural Three.js island with third-person camera and HUD.
- Added automated tests, byte-for-byte determinism verification, and GitHub Actions CI.

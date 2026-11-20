# Phase 1 — requirements, assumptions, and plan

## Acceptance criteria

| Requirement | Verifiable result | Planned evidence |
|---|---|---|
| Night 1 has five large lanterns | A new game and every snapshot contain L1–L5 | Automated scenario test |
| Mây can move and collect motes | Movement follows camera yaw; nearby motes are collected up to capacity | Unit/headless test |
| Mây can light lanterns | Rising-edge interact deposits carried motes; cost 3 lights a lantern | Headless scenario |
| Shades chase and hurt Mây | Active shades move toward the player; a hit removes one flame | Headless scenario |
| Pulse repels shades | A pulse costs one carried mote, stuns and pushes shades in radius | Headless scenario |
| Lanterns protect Mây | Shades cannot enter the safe radius of a lit lantern | Unit test |
| Win/loss/replay/score/HUD | All lanterns lit wins; dawn or zero flames loses; UI exposes restart | Automated core tests + screenshot/video |
| Contract v1.0 | CLI validates inputs and emits deterministic JSONL with required end record | Contract and determinism tests |

## Explicit assumptions

- A flame is one health point. Mây begins with 3 flames.
- “Light” spent by pulse means one carried mote, not a health flame.
- Mote collection is automatic within 1.5 m and stops at capacity 6.
- Interact deposits as many carried motes as the selected lantern still needs.
- A hit drops `floor(carried × 0.5)` motes around Mây and grants 1 second of invulnerability.
- Lantern safety is active only after the lantern is lit.
- Falling is disabled in Phase 1; the playable island boundary blocks movement.
- End bonuses (`per_second_left`, `per_flame_left`) are awarded only on a win, once.
- When events share a tick, player movement/collection and player actions resolve before shade movement/hits, then the terminal condition is checked.

## Tuning rationale

The island has a 38 m playable radius. A speed of 6 m/s keeps traversal short. Five lanterns cost 15 motes total; the default level contains more than 15 so recovery after hits is possible. Shade speed is half the player's speed, making pursuit readable while still dangerous near obstacles.

## AI log

| Session | Work | Estimated usage | Saving decision |
|---|---|---:|---|
| Phase 1 implementation | Repo audit, contract extraction, deterministic core, tests, 3D client, docs, QA | ≈35k tokens (rough session estimate; replace with UI actual if available) | Reused one deterministic core for web and headless; used procedural geometry instead of sourcing assets |

## Phase evaluation

- **Achieved:** deterministic contract CLI, 13 automated tests, byte-identical repeat runs, production web build, five-lantern Night 1 loop, procedural 3D scene, HUD, win/loss, and replay implementation.
- **Regression check:** `npm run verify` reruns all core and CLI checks; GitHub Actions repeats verification and production build on push.
- **AI/tool mistakes found:** the first visual pass rendered the Vietnamese title badly; headless screenshot review caught it and the font/size were corrected. The initial Vite version had a high-severity dev-server advisory; `npm audit` found it and Vite was upgraded to 7.3.8, leaving zero known vulnerabilities. A manual keyboard check found A/D visually reversed because the camera's screen-right vector is negative local X; the web key mapping was inverted without changing the Contract-defined core movement formula.
- **Harness change:** added a short `AGENTS.md` completion gate, byte-for-byte determinism script, and CI so gameplay changes cannot rely on memory alone.
- **Remaining gap:** Chrome headless proves WebGL, menu, scene, and HUD rendering, but a human keyboard/mouse playthrough and video are still required before tagging Phase 1.

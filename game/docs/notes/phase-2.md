# Phase 2 — Ticket-02 plan and acceptance criteria

Status: requirements captured; implementation proceeds in independently verified slices.

## Sources

- Ticket-02 / Test Contract v1.1 supplied through the lab board export.
- Instructor deck is process guidance only; it does not define exact tuning or palette values.
- Phase 1 regression baseline: tag `phase-1` (`6590b26`).

## Blocking information still required

The supplied export references values that are not present in the text. Do not invent them:

1. Complete standardized tuning table, including base carry/cost/radii, dash cooldown, and Night 2/3 durations.
2. Complete standard RGB palette table.
3. Any exact Night names or Ông Đăng introduction text required by the original ticket.
4. Night 2/3 player starts and whether their recurring shade schedules begin after one full interval.
5. Dash direction is not stated; the implementation uses current movement direction, or the last facing direction while idle.
6. The ticket does not define the “fog points” used to spawn drifters; automatic spawning stays disabled until those coordinates are supplied.
7. Idle drifter pathing is not specified; scenario drifters use a seeded deterministic heading at 2 m/s.

Work that does not depend on these values may proceed. Contract/tuning completion and visual palette sign-off remain blocked until the original tables are available.

## Contract v1.1 acceptance criteria

| Area | Acceptance criterion | Verification |
|---|---|---|
| Version and nights | Contract reports `1.1`; `--night` accepts 1, 2, 3 and rejects other values with exit code 2 | CLI integration tests |
| Fixed step | Gameplay remains exactly 60 simulation steps per second | Unit tests |
| Pause | Rising-edge pause emits `paused`/`resumed`; wall `tick` continues while `sim_tick`, timers, cooldowns, TTL and spawns stop | Headless pause scenario |
| Snapshot | Snapshot includes `night`, wind, complete player motion/cooldown fields, motes, drifters and charms | Schema assertions |
| Scenario | v1.1 scenario overrides player counters and replaces drifter/charm lists without construction events or score | Scenario tests |
| Input | `dash` and `pause` are stateful rising-edge buttons | Input timeline tests |
| Determinism | Same seed/scenario/inputs produces byte-identical JSONL | Two-run comparison |
| Performance | A full Night of at most 21,600 ticks finishes within 30 seconds | Timed headless proof |

## Gameplay acceptance criteria

| Feature | Acceptance criterion | Minimum headless scenario |
|---|---|---|
| Standard score | Deposit, lantern, pulse-hit and win bonuses follow the Ticket-02 formula; total game score sums won Nights | Controlled score scenario |
| Update order | Pause, counters, player, pickups, interact, safe zone, pulse, enemies, contacts, spawn, terminal and snapshot resolve in the specified order | Same-tick collision scenario |
| Night 1 | Standard island radius, lantern positions, mote points and shade schedule are exact | Geometry/spawn snapshot |
| Night 2 | Two islands, bridge, six lanterns, launch pads and per-island spawns are exact | Traversal/spawn scenario |
| Night 3 | Three height levels, ramps, launch pad, tower, seven lanterns and strong wind are exact | Height/wind scenario |
| Dash | Rising edge moves at the standard dash speed/duration; cooldown applies; a new press during dash is ignored | Dash timeline |
| Falling | Leaving valid ground produces the specified fall hit and recovery/loss data | Edge/bridge scenario |
| Gió Lạc | Idle/chase/flee/removed, steal priority, pulse drop and schedules match the ticket | One scenario per transition/contact |
| Bùa Gió | Pickup lasts 600 ticks, refreshes, changes speed, removes dash cooldown and respawns after 2,700 ticks | Pickup/expiry/respawn scenario |
| Three-Night flow | Win advances; Night 3 win shows dawn/total score; loss retries the same Night | Core flow tests + browser proof |
| HUD/pause/settings/audio | Required HUD fields, pause menu, persisted volume/sensitivity and listed cues are present | Browser proof/checklist |
| Frame rate | Normal build averages at least 30 FPS at 1280×720 | Measured browser proof |

## Implementation slices

1. **Regression lock:** run Phase 1 tests/determinism before and after every slice.
2. **Clock and pause foundation:** introduce wall tick, simulation tick and paused state with no gameplay changes while unpaused.
3. **Night configuration:** data-driven map/entity/spawn definitions for Nights 1–3.
4. **Movement:** dash, falling, launch pads, bridges/levels/ramps and strong wind.
5. **Entities:** dropped-mote TTL, standardized shades, Gió Lạc and Bùa Gió.
6. **Contract surface:** v1.1 scenario/input/snapshot/events and performance run.
7. **Web product:** three-Night flow, standardized HUD, pause/settings/audio and palette.
8. **Release:** proof matrix, regression, clean clone, commit/tag/push `phase-2`.

## Phase 2 log

| Slice | Result | Regression | Notes |
|---|---|---|---|
| Requirements lock | Acceptance matrix created; missing exact tables recorded | Phase 1 baseline remains green | No values invented |
| Clock and pause foundation | Wall tick, simulation tick, paused snapshots and pause/resume events implemented | 16/16 tests; Phase 1 determinism remains 7,884 identical bytes; production build passes | No tuning changes |
| Night configuration | Standard terrain, lantern, spawn-point, launch-pad, charm, drifter and wind data captured for all three Nights | 21/21 tests; Phase 1 determinism remains 7,884 identical bytes | Unspecified Night 2/3 starts and first recurring shade tick remain unset |
| Standard score | Contract 1.1 scores deposited motes, pulse targets, lanterns and win bonus using the Ticket-02 formula | 24/24 tests; Phase 1 determinism remains 7,884 identical bytes | Contract 1.0 scoring remains isolated for regression |
| Wind charm lifecycle | C1/C2 positions, pickup event, 600-tick buff, 7.2 m/s speed, paused timers and 2,700-tick respawn implemented | 27/27 tests; Phase 1 determinism remains 7,884 identical bytes; production build passes | No-cooldown dash effect waits for the dash slice |
| Dash foundation | Rising-edge dash runs at 14 m/s for 12 ticks; active presses are ignored; pause freezes cooldown; charm removes cooldown | 31/31 tests; Phase 1 determinism remains 7,884 identical bytes | Standard cooldown is read from tuning and awaits the missing table; direction assumption is recorded above |
| Drifter behavior | Scenario drifters implement idle/chase/flee, 7 m/s pursuit, steal-before-shade contact, pulse escape/drop, 240/120-tick removal timers and v1.1 events/snapshots | 35/35 tests; Phase 1 determinism remains 7,884 identical bytes | Automatic spawn waits for missing fog-point coordinates; seeded idle-heading assumption is recorded above |
| v1.1 scenario/snapshot | Player counters, exact shade state names, replacement drifter/charm lists, wind override, motion/cooldown/entity/mote snapshot fields and paused TTLs implemented | 38/38 tests; Phase 1 determinism remains 7,884 identical bytes | Dropped-mote TTL value awaits the missing standard tuning table |
| Night 3 wind | Seeded direction, 1,800-tick cycle, 120-tick warning, 300-tick active window, 2 m/s force, pause freeze and scenario disable implemented | 41/41 tests; Phase 1 determinism remains 7,884 identical bytes | Browser warning leaves/audio still belong to the web slice |
| Web pause/settings shell | Esc/P input, Continue/Retry/Settings/Menu actions, persisted volume/sensitivity sliders and Shift dash input wired | Production build and static DOM wiring checks pass; core pause tests pass | Browser interaction proof pending because no browser surface is available in the current environment |


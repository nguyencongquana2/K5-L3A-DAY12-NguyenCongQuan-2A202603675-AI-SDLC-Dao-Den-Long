# Agent guide

## Project invariants

- `game.contract.json` is the source of truth for gameplay tuning.
- Keep deterministic gameplay in `game/src/core`; rendering belongs in `game/src/web`.
- Headless mode must not create a window or require a GPU.
- One simulation step is exactly 1/60 second. Never use wall-clock time in core logic.
- Scenario construction must not emit events or award score.
- Do not hand-edit generated proof output.
- Preserve the `phase-1` tag and keep all still-valid Phase 1 scenarios green during Phase 2.
- In v1.1, wall `tick` continues while paused; `sim_tick` and every gameplay timer stay frozen.
- Do not guess standardized tuning or RGB values that are absent from the supplied ticket export; record the gap in `game/docs/notes/phase-2.md`.

## Commands

- Install: `npm --prefix game ci`
- Run game: `npm --prefix game run dev`
- Headless: `npm --prefix game run headless -- --seed 1 --night 1 --ticks 60 --out output.jsonl`
- Verify: `npm --prefix game run verify`
- Production build: `npm --prefix game run build`

## Completion gate

After changing gameplay or the contract, run `npm --prefix game run verify`. Do not claim completion while it is red. Keep requirements, assumptions, and evidence current in `game/docs/notes` and `game/docs/proof`.

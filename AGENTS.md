# Agent guide

## Project invariants

- `game.contract.json` is the source of truth for gameplay tuning.
- Keep deterministic gameplay in `game/src/core`; rendering belongs in `game/src/web`.
- Headless mode must not create a window or require a GPU.
- One simulation step is exactly 1/60 second. Never use wall-clock time in core logic.
- Scenario construction must not emit events or award score.
- Do not hand-edit generated proof output.

## Commands

- Install: `npm --prefix game ci`
- Run game: `npm --prefix game run dev`
- Headless: `npm --prefix game run headless -- --seed 1 --night 1 --ticks 60 --out output.jsonl`
- Verify: `npm --prefix game run verify`
- Production build: `npm --prefix game run build`

## Completion gate

After changing gameplay or the contract, run `npm --prefix game run verify`. Do not claim completion while it is red. Keep requirements, assumptions, and evidence current in `game/docs/notes` and `game/docs/proof`.

# Agent guide

## Project invariants

- `game.contract.json` is the source of truth for gameplay tuning.
- Keep deterministic gameplay in `src/core`; rendering belongs in `src/web`.
- Headless mode must not create a window or require a GPU.
- One simulation step is exactly 1/60 second. Never use wall-clock time in core logic.
- Scenario construction must not emit events or award score.
- Do not hand-edit generated proof output.

## Commands

- Install: `npm ci`
- Run game: `npm run dev`
- Headless: `npm run headless -- --seed 1 --night 1 --ticks 60 --out output.jsonl`
- Verify: `npm run verify`
- Production build: `npm run build`

## Completion gate

After changing gameplay or the contract, run `npm run verify`. Do not claim completion while it is red. Keep requirements, assumptions, and evidence current in `docs/notes` and `docs/proof`.

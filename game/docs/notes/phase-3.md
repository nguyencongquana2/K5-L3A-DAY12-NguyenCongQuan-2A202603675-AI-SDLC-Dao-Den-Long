# Phase 3 decision record — lantern lifecycle and dawn victory

Status: accepted · Contract: v1.2 · Date: 2026-11-20

## Context

Ticket-03 replaces permanent lanterns and the immediate `all_lit` victory. Fuel, Shade draining, relighting and dawn evaluation all affect the same tick, so using loosely related booleans or floating-point subtraction would make boundary cases difficult to reproduce.

## Decision

Each lantern keeps `lit`, `deposited`, `everLit`, `relitCount` and an integer `fuelUnits`. One fuel unit in the public rules equals 60 internal units, so normal decay subtracts exactly 1 and each draining Shade subtracts exactly 5 per simulation tick. `fuel` is a derived display value and snapshots round it to one decimal place. An outage atomically sets `lit = false`, `fuelUnits = 0`, and `deposited = 0`, while preserving history.

The Phase 3 tick performs fuel decay and active drain before movement, collection and player actions. It then updates entities and evaluates terminal state after every update. `no_flames` is checked first. Dawn wins only when `ceil(0.6 × lantern count)` lanterns remain lit; lighting every lantern never ends a Night early.

Shade target selection is state-owned: only `wander` selects the nearest weak lit lantern, with id as the deterministic tie-break, and otherwise selects the nearest unlit lantern. `chase` remains committed to Mây. `drain` does not move. A refuel crossing 30 fuel or a new light repels Shades within the specified 6 m interaction zone to its edge and gives 30 recoil ticks without contact damage.

Contract v1.0 and v1.1 branches remain explicit regression modes. Contract v1.2 uses only the new score formula; the old score keys remain readable solely for old-version tests.

## Consequences

- Pause can advance wall `tick` without changing fuel, `sim_tick` or any gameplay timer.
- Scenario construction only initializes state; preset lights do not increment `successful_lights`, emit events or score.
- A Shade that enters `drain` at the end of a step first drains on the next step, preserving the rule that newly transitioned/spawned entities do not interact retroactively.
- `fuel_drain` is emitted per Shade after each continuous block of 60 drain ticks and reports the post-step lantern fuel.

## Replaced tests

No Phase 1–2 regression test was skipped or deleted. Historical immediate-win and Phase 2 scoring tests continue to run against explicit v1.0/v1.1 simulations. New v1.2 tests assert that all-lit remains `playing`, and replace the current-contract expectation with dawn threshold/scoring assertions.

## Acceptance evidence

| Requirement | Automated evidence |
|---|---|
| Exact fuel, outage, refuel and relight | `tests/phase3.test.js` |
| Drain targeting, event cadence, pulse score and repel | `tests/phase3.test.js` |
| Dawn threshold, end priority and score | `tests/phase3.test.js` |
| Capacity and snapshot/scenario fields | `tests/phase3.test.js` |
| Persisted palette and non-colour lantern cues | `tests/phase3-web.test.js` |
| Phase 1–2 stability | Full `npm run verify` suite and deterministic comparison |

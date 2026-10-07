# Strikeforce30 Tabletop Playtest v0.4.0

This branch tracks the rules-backed Strikeforce30 browser playtest checkpoint.

## Browser telemetry + event logging

The tabletop now exposes the canonical append-only engine event stream as a playtest instrument.

- **Event log**: readable event summaries in exact engine sequence.
- Filters: **Combat**, **Movement**, **Gameplay**, and **System**.
- Every row expands to the untouched raw event envelope/payload.
- **Telemetry**: session metrics derived from canonical events/state, including player decisions, movement, Shoot, Melee, Charge success, damage, destroyed units, Fate Dice, final VP/Command, unit disposition, and Territory control.
- **Download session JSON**: telemetry + canonical events + action history + final GameState.
- **Download events JSONL**: one normalized record per canonical event.
- **Copy JSONL**: clipboard handoff for analysis workflows.
- RG-007 remains explicit and objective VP is not fabricated.
- Telemetry is observational only; legality/state mutation remain exclusively in `StrikeforceRulesEngine`.

## Verification checkpoint

- local milestone commit: `6e2296b`
- 209/209 automated tests passing
- TypeScript check clean
- synthetic deterministic smoke: 10,000 matches / 80,000 steps / `fnv1a32:194e0650`
- production deterministic smoke: 1,000 matches / 9,000 steps / `fnv1a32:2ed91fb8`
- production stops at sourced boundary RG-007
- final packaged artifact was re-extracted and verified: tests pass, server health responds, telemetry module serves
- packaged ZIP SHA-256: `7cca15ae8332ca337640306efe706b32d590ca1cd924ff09567832a4d2f0f5e4`

## Important

The original `main` branch still contains the older alpha shell and remains intentionally untouched while playtest-lab work is isolated. This GitHub branch is still a checkpoint record; the full runnable v0.4.0 source tree has not been pushed here yet.

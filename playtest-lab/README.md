# Strikeforce30 Tabletop Playtest v0.3.1

This branch tracks the rules-backed Strikeforce30 browser playtest checkpoint.

## Tabletop layout

- Territory cards form the horizontal center line.
- Fatebound / Player 2 occupies the upper play zones.
- Iron Wake / Player 1 occupies the lower play zones.
- Strongholds bookend the battlefield.
- VP / Reserves / Destroyed / Command stay on the table-edge rails.
- Units physically sit beside the Territory they occupy.
- READY units use canonical drag-and-drop Move/attack legality from `StrikeforceRulesEngine`.

## Hover inspection — v0.3.1

The persistent information boxes have been removed from the physical pieces.

- Unit pieces keep only their art/token, health marker, and compact name.
- Hover/focus opens a floating inspector with HEALTH, SHOOT, MELEE, DEFENSE, OC, MOVEMENT, activation state, location, and sourced ability text.
- Territory cards lose the large bottom information overlay.
- Hover/focus on a Territory opens its name, class, control, activation, and current occupants.
- Drag/drop legality and game mutation are unchanged.

## Verification checkpoint

- 195/195 automated tests passing
- TypeScript check clean
- synthetic deterministic smoke: 10,000 matches / 80,000 steps / `fnv1a32:194e0650`
- production deterministic smoke: 1,000 matches / 9,000 steps / `fnv1a32:2ed91fb8`
- production stops at sourced boundary RG-007
- packaged artifact SHA-256: `1483606ad68cfc52bea48378e4f170b495dcb4eb450e9ee78498091e61aa2ecb`

## Important

The original `main` branch still contains the older alpha shell and remains intentionally untouched while playtest-lab work is isolated.

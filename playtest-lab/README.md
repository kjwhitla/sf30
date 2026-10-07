# Strikeforce30 Tabletop Playtest v0.3.3

This branch tracks the rules-backed Strikeforce30 browser playtest checkpoint.

## Interaction / resolution milestone

- Action selection is exclusive. Move, Shoot, Melee, and Charge each replace the prior action mode instead of accumulating highlights.
- Move highlights only legal Territory destinations for the selected unit.
- Shoot/Melee/Charge highlight only legal enemy unit cards for the selected action.
- Clicking a glowing battlefield card is the spatial selection; the redundant target-button list is removed for those actions.
- A resolution lock prevents double-clicks / multiple queued actions while a roll is being shown.
- Charge rolls, Shoot Defense rolls, and Melee Defense rolls animate before the next priority/response state becomes interactive.
- The browser uses the supplied blue Strikeforce30 Fate Die face assets.
- The deterministic rules engine now preserves the exact physical face index (1–6) alongside each numeric Fate Die value (0/1/2), so the settled browser dice are the actual faces rolled rather than reconstructed generic faces.

## Tabletop geometry retained

- Territory cards form the horizontal center line.
- Unit cards use the same 5:3 footprint as Territory cards.
- Each Territory has a separate Player Zone for each player.
- Up to 3 friendly units stack vertically in each Player Zone.
- Hover inspection remains separate from the physical card face.

## Verification checkpoint

- local milestone commit: `9f81d4a`
- 197/197 automated tests passing
- TypeScript check clean
- synthetic deterministic smoke: 10,000 matches / 80,000 steps / `fnv1a32:194e0650`
- production deterministic smoke: 1,000 matches / 9,000 steps / `fnv1a32:2ed91fb8`
- production stops at sourced boundary RG-007
- packaged ZIP SHA-256: `e9cd58e6315eb206de23ef56b8cc73d164ded543eac4a18569989522f43262ff`

## Important

The original `main` branch still contains the older alpha shell and remains intentionally untouched while playtest-lab work is isolated.

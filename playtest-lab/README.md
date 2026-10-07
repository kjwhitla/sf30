# Strikeforce30 Tabletop Playtest v0.3.2

This branch tracks the rules-backed Strikeforce30 browser playtest checkpoint.

## Physical battlefield geometry

The browser now follows the sourced tabletop structure instead of treating units as small UI tokens:

- Battlefield is a line of Territory cards.
- Every Territory has a separate Player Zone for each player.
- Each Player Zone supports the sourced maximum of 3 friendly units.
- Unit cards use the same 5:3 footprint and lane width as Territory cards.
- Multiple unit cards in one Territory are a vertical overlapping stack.
- Player 2 stacks upward away from the Territory; Player 1 stacks downward.
- Hover raises the inspected card above its stack and opens the floating inspector.
- READY units retain canonical drag-and-drop Move/attack legality from `StrikeforceRulesEngine`.

## Verification checkpoint

- 196/196 automated tests passing
- TypeScript check clean
- synthetic deterministic smoke: 10,000 matches / 80,000 steps / `fnv1a32:194e0650`
- production deterministic smoke: 1,000 matches / 9,000 steps / `fnv1a32:2ed91fb8`
- production stops at sourced boundary RG-007
- packaged artifact SHA-256: `40d8bd65e9b7d2a2a8cf7475c9896ef8e0953b117d3e7c928035e3d58e62b60b`

## Important

The original `main` branch still contains the older alpha shell and remains intentionally untouched while playtest-lab work is isolated.

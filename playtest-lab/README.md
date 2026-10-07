# Strikeforce30 Tabletop Playtest v0.4.3

This branch tracks the rules-backed Strikeforce30 browser playtest checkpoint.

## Compact tactical unit inspection

The unit hover is now a compact battlefield aid rather than a debug inspector or second card.

- 360px desktop tactical tooltip with content-driven height.
- Anchors outside the hovered card and chooses right / left / top / bottom based on viewport space.
- 150ms hover-intent delay, 110ms pointer-travel grace, and 120ms fade/translate entrance.
- Pointer can move from the card into the tooltip without flicker.
- Clicking a unit pins inspection; click-away or Escape unpins it.
- Keyboard focus exposes the same inspection.
- Gameplay selected/target states remain visually stronger than hover styling.

### Information hierarchy

- faction + unit class metadata
- unit identity
- current / effective HP
- continuous SH / ME / DF / OC / MV strip
- primary ability
- On-Death effect
- contextual statuses only when applicable

When a current stat differs from its printed/base value, the tooltip shows `base → effective` instead of silently replacing the printed number. Existing `temporaryStatModifiers` are named in the contextual state area (for example `+2 DF · Dig In` or future ability-sourced modifiers). Wounds are shown as persistent damage context.

Player-facing tooltip copy strips source-spreadsheet parenthetical design questions such as the old Iron Captain uncertainty note. This milestone does not change canonical game legality or state mutation.

## Verification checkpoint

- local runnable-tree commit: `d3f9b4d`
- 223/223 automated tests passing
- TypeScript check clean
- synthetic deterministic smoke: 10,000 matches / 80,000 steps / `fnv1a32:194e0650`
- production deterministic smoke: 1,000 matches / 9,000 steps / `fnv1a32:2ed91fb8`
- production still stops at sourced boundary RG-007
- final ZIP was re-extracted; all 223 tests and TypeScript check passed from the extracted artifact
- extracted package server verified through `/health` and served browser `APP_VERSION = 0.4.3`
- packaged ZIP SHA-256: `1643e06cafbb12ed1579b1600332ed1a5e5f8d8034b7d982ae8cf8ea96b456df`

## Important

The original `main` branch remains intentionally untouched while playtest-lab work is isolated. This GitHub branch is still a checkpoint record; the complete runnable v0.4.3 source tree has not been pushed to GitHub.

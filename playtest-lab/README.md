# Strikeforce30 Tabletop Playtest v0.3

This branch is the checkpoint for the rules-backed Strikeforce30 browser playtest.

## Layout correction

v0.2 proved the rules engine could render in-browser, but its four software columns did not represent the physical tabletop well enough.

v0.3 changes the browser around the owner-supplied battlefield layout reference:

- central horizontal Territory-card row
- Fatebound / Player 2 play zones above the Territories
- Iron Wake / Player 1 play zones below the Territories
- Strongholds at opposite ends
- VP / Reserves / Destroyed / Command on table-edge rails
- unit cards/tokens physically located beside the Territory they occupy
- owner-supplied unit art used where an exact asset exists
- neutral labeled tokens used where art is not sourced

## Drag-and-drop interaction

READY units belonging to the player with priority are draggable.

- Drop on a highlighted Territory or its play zone to execute a canonical Move.
- Drop on a highlighted enemy unit to attack.
- If more than one attack is legal for the same target, the drop opens a contextual choice rather than guessing between Shoot, Melee, or Charge.
- Click interaction remains as a fallback.
- The UI only highlights actions returned by the production `StrikeforceRulesEngine`.

## Verification checkpoint

- 195/195 automated tests passing
- TypeScript check clean
- Point of Domination initial render: 4 Territories / 8 units
- packaged artifact SHA-256: `43404fd59680ad7fd50c9f5356b1e9a03754ff417c0856b41033f5603ed4929d`

## Important

The original `main` branch still contains the older alpha shell and remains intentionally untouched while the playtest-lab work is isolated.

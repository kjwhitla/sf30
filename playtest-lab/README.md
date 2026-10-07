# Strikeforce30 Tabletop Playtest v0.3.6

This branch tracks the rules-backed Strikeforce30 browser playtest checkpoint.

## Melee flow correction

The browser no longer exposes automatic Melee cursor transitions as player decisions.

- Declaring Melee / successful Charge automatically resolves the initiator strike.
- A surviving defender pauses only for the sourced Fight back / Retreat choice.
- Fight back automatically resolves retaliation and, if both units survive, the next initiator strike.
- The UI shows Exchange X of Y so the two-exchange sequence is explicit rather than appearing to loop.
- Undo groups automatic cursor steps with the real player choice that caused them.

## Scouts On-Death

The owner-supplied Scouts card and playtest source establish:

- Roll 1FD immediately when Scouts are destroyed.
- On a 2, deal 1 DMG to an enemy unit in THIS Territory.
- Troop destruction still routes Scouts to Reserves and awards the printed/default destroyed VP.

The engine now supports the roll and a serializable target-choice state. If the roll is 2, only legal enemy cards in the death Territory glow and the Scouts owner chooses one. The supplied Fate Die faces are used for the animation.

The exact reported seed-3030 sequence through event #12 is a regression test. Immortals' Fight Back destroys Scouts, Scouts' On-Death resolves, Melee terminates because a combatant was destroyed, and normal priority resumes.

## Verification checkpoint

- local milestone commit: `c3ef3c1`
- 205/205 automated tests passing
- TypeScript check clean
- synthetic deterministic smoke: 10,000 matches / 80,000 steps / `fnv1a32:194e0650`
- production deterministic smoke: 10,000 matches / 90,000 steps / `fnv1a32:185470c7`
- production still stops at sourced boundary RG-007
- packaged ZIP SHA-256: `f27497e6c3b4c5bd000af730b1d8db9061c2d0bb7d1211d5623505420d5d9d06`

## Important

The original `main` branch still contains the older alpha shell and remains intentionally untouched while playtest-lab work is isolated.

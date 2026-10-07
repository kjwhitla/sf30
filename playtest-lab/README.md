# Strikeforce30 Tabletop Playtest v0.3.4

This branch tracks the rules-backed Strikeforce30 browser playtest checkpoint.

## Fatebound visual pass

Owner-supplied full-card art is now mapped to the matching canonical Live Stats unit definitions:

- Gate Baron
- Immortals
- Gatewings
- The Hallowed
- Silencers
- Spikemites

The Point of Domination baseline therefore renders all four Fatebound starting units with their actual supplied cards. The browser does not derive rules from card pixels; canonical legality and state mutation remain in StrikeforceRulesEngine.

## Interaction / resolution retained

- Action selection is exclusive: Move/Shoot/Melee/Charge replace prior highlights.
- Legal battlefield cards glow and are selected spatially.
- Resolution locks input while supplied Fate Dice animate and settle on the exact physical faces rolled.
- Unit cards match Territory-card footprint and stack vertically in Player Zones.
- Hover inspection remains available for runtime state.

## Verification checkpoint

- local milestone commit: `84c8e72`
- 198/198 automated tests passing
- TypeScript check clean
- synthetic deterministic smoke: 10,000 matches / 80,000 steps / `fnv1a32:194e0650`
- production deterministic smoke: 1,000 matches / 9,000 steps / `fnv1a32:2ed91fb8`
- production stops at sourced boundary RG-007
- packaged ZIP SHA-256: `e155c73bcb804d55577355ceed59119a53b1b184e2bea36d49e6ae9273380afb`

## Important

The original `main` branch still contains the older alpha shell and remains intentionally untouched while playtest-lab work is isolated.

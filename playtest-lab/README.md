# Strikeforce30 Tabletop Playtest v0.4.2

This branch tracks the rules-backed Strikeforce30 browser playtest checkpoint.

## Board combat presentation

The browser playtest now keeps the tabletop readable while making combat feel physical.

- Fatebound cards are upright in the browser operator view for now.
- Shoot resolution: attacker recoil/wiggle → projectile tracer → impact burst + target wiggle → supplied Fate Dice resolution → physical wound-token placement.
- Melee resolution: lunge/impact reaction → supplied Fate Dice resolution → wound-token placement.
- Input stays locked until all visual resolution steps finish, so the next player cannot act early.
- Every point of combat damage adds one persistent **-1 wound token** to the card; the token count follows canonical `unit.wounds`.
- Wound tokens reduce HEALTH, SHOOT, MELEE, and DEFENSE through the existing rules engine exactly as before.
- Deactivation is represented with a physical card token instead of relying only on opacity.
- Temporary stat modifiers render as card tokens (for example `+2 DEF` for Dig In).
- A Territory that has already been Pinged shows the physical Ping / Activate token.
- The token layer is presentation only; authoritative legality and state mutation remain in `StrikeforceRulesEngine`.

## Verification checkpoint

- local milestone commit: `b398eac`
- 215/215 automated tests passing
- TypeScript check clean
- synthetic deterministic smoke: 10,000 matches / 80,000 steps / `fnv1a32:194e0650`
- production deterministic smoke: 1,000 matches / 9,000 steps / `fnv1a32:2ed91fb8`
- production still stops at sourced boundary RG-007
- final ZIP was re-extracted; 215 tests and TypeScript check passed from the extracted artifact
- extracted package server verified via `/health`, v0.4.2 browser asset, and the wound-token asset
- packaged ZIP SHA-256: `6068b8599a53f9c78fb6785bff36df390490c5b758b63b3520eaf13d848c5ace`

## Important

The original `main` branch still contains the older alpha shell and remains intentionally untouched while playtest-lab work is isolated. This GitHub branch remains a checkpoint record; the full runnable v0.4.2 source tree has not been pushed here yet.

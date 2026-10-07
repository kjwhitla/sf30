# Strikeforce30 Tabletop Playtest v0.4.1

This branch tracks the rules-backed Strikeforce30 browser playtest checkpoint.

## Point of Domination Ping / Activate

The current printed Point of Domination territory functions are now executable through the production rules engine.

- `unit.ping` is a canonical Action Phase action.
- A ready on-field unit Pings its current Territory and deactivates.
- A Territory may be Pinged once per round; its activation resets at the next round start.
- T1 / Iron Bastion: current controller gains +1 Command, capped at 3.
- T2 / Battleground: current controller gains +1 VP.
- T3 / Wasteland: no executable Ping effect.
- T4 / Void Gate: current controller gains +1 Command, capped at 3.
- The browser exposes **Ping / Activate** only when projected legal by `StrikeforceRulesEngine`.
- Selecting Ping makes the legal Territory glow; clicking that Territory commits the action.
- Other candidate Territory-library Ping mechanics remain gated rather than inferred.

## Physical score / resource markers

The browser now includes transparent tabletop-style presentation assets:

- orange Territory/general VP markers (1 / 3 / 5)
- red Kill VP marker
- Command marker
- Ping / Activate marker

The side rails distinguish total VP, Kill VP, Command, Reserves, and Destroyed cards. The token art is presentation-only; rules/state remain authoritative.

## Telemetry

`territory.pinged` is included in readable event logging and telemetry, including Ping count, Command gained through Ping, and VP gained through Ping.

## Verification checkpoint

- local milestone commit: `bd540ac`
- 214/214 automated tests passing
- TypeScript check clean
- synthetic deterministic smoke: 10,000 matches / 80,000 steps / `fnv1a32:194e0650`
- production deterministic smoke: 1,000 matches / 9,000 steps / `fnv1a32:2ed91fb8`
- production still stops at sourced boundary RG-007
- final ZIP was re-extracted; tests/check passed; server health, browser v0.4.1 asset, Kill token asset, and initial T4 Ping actions were verified from the extracted package
- packaged ZIP SHA-256: `feec61950abecec9d35d97bd75891486cc8f3401129771d25c97e89837cc02cd`

## Important

The original `main` branch still contains the older alpha shell and remains intentionally untouched while playtest-lab work is isolated. This GitHub branch remains a checkpoint record; the full runnable v0.4.1 source tree has not been pushed here yet.

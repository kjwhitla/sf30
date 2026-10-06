# Strikeforce30 Playtest Lab v0.2

This branch is reserved for the rules-backed Strikeforce30 playtest lab and browser client.

## Browser milestone

The verified v0.2 runtime:

- starts with `npm run dev`
- prefers `127.0.0.1:4173`
- detects a stale process occupying 4173 and automatically advances to the next free port
- serves the canonical Point of Domination browser playtest
- renders 4 battlefield Territories and 8 starting units from the production session
- uses the production `StrikeforceRulesEngine` for legal actions and mutations
- stops at unresolved RG-007 Territory VP rather than inventing scoring

## Verification checkpoint

- 195/195 tests passing
- TypeScript check clean
- production deterministic smoke: 10,000 matches / 90,000 steps
- production fingerprint: `fnv1a32:185470c7`
- synthetic deterministic smoke: 10,000 matches / 80,000 steps
- synthetic fingerprint: `fnv1a32:194e0650`
- packaged stale-port regression: with 4173 deliberately occupied, v0.2 bound to 4174 and served root, app module, and health endpoint successfully
- package SHA-256: `80983382e7bc3da5b4e68d05ee661a8f10e518ec1fb13c83ab3cd448367aeed1`

## Important

The original `main` branch contains an older unrelated alpha shell. It is intentionally untouched. The playtest-lab work belongs on this branch until the repository structure is reconciled.

# Strikeforce30

Strikeforce30 is currently developed and verified on the `playtest-lab-v0.2` branch.

## Current canonical checkpoint

- Browser/playtest milestone: **v0.4.3**
- Canonical rules runtime: **StrikeforceRulesEngine**
- Automated tests at the recorded v0.4.3 checkpoint: **223/223 passing**
- TypeScript check: clean
- Synthetic deterministic smoke: 10,000 matches / 80,000 steps / `fnv1a32:194e0650`
- Production deterministic smoke: 1,000 matches / 9,000 steps / `fnv1a32:2ed91fb8`
- Known sourced rules boundary: **RG-007 Territory VP**
- `main` still contains the legacy v0.1 alpha shell and is **not** the canonical development state.

## Run the verified headless engine

```bash
git checkout playtest-lab-v0.2
git pull origin playtest-lab-v0.2
cd playtest-lab
npm ci
npm run check
npm test
npm run smoke:synthetic
```

## Repository state

The verified TypeScript rules engine, tests, simulation tools, and lockfile are now committed as ordinary Git-tracked source and CI validates them directly from a fresh checkout.

The browser client is still carried separately as a bootstrap payload, but the committed payload is currently truncated and not runnable to EOF. See `playtest-lab/browser/README.md` for the verified recovery boundary and required source recovery.

The active repository milestone is **v0.5 — Repository Normalization + Scenario-Driven Architecture**.

### v0.5 exit criteria

1. Commit the browser source and assets directly to Git; the engine source is now normalized.
2. Remove remaining browser bootstrap transport after the normal browser source tree is independently verified.
3. Make the repository runnable from a fresh clone through one obvious developer path.
4. Keep rules legality and state mutation exclusively in the canonical engine.
5. Represent scenario-specific setup through declarative scenario/content data wherever possible.
6. Prove the architecture with at least two battlefields/scenarios using the same engine rather than scenario-specific UI logic.

## Design / engine boundary

The browser should display and invoke only actions projected as legal by the rules engine. Presentation, animation, inspection, and telemetry must not become alternate rules authorities.

Unknown or unresolved sourced rules should remain explicit boundaries rather than being silently inferred.

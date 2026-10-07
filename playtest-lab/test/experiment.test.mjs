import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "../dist/engine/state.js";
import {
  createPolicyMatrixVariants,
  fingerprintTelemetry,
  fingerprintValue,
  runExperiment,
  validateExperimentManifest
} from "../dist/simulation/experiment.js";
import { FirstLegalPolicy, RandomLegalPolicy } from "../dist/simulation/policy.js";
import { SyntheticRulesEngine } from "../dist/simulation/synthetic-engine.js";

const testSource = {
  id: "experiment-test",
  kind: "test-fixture",
  title: "Synthetic experiment test source",
  version: "experiment-test-v1",
  locator: "test/experiment.test.mjs"
};

const policyRegistry = {
  "first-legal": () => new FirstLegalPolicy(),
  "random-legal": () => new RandomLegalPolicy()
};

function createState(matchId, seed) {
  return createInitialGameState({
    gameId: matchId,
    seed,
    players: {
      alpha: { id: "alpha", factionId: "synthetic-a", command: 0, victoryPoints: 0, unitIds: [] },
      beta: { id: "beta", factionId: "synthetic-b", command: 0, victoryPoints: 0, unitIds: [] }
    }
  });
}

function makeManifest() {
  const variants = createPolicyMatrixVariants({
    playerIds: ["alpha", "beta"],
    policyIds: ["first-legal", "random-legal"],
    sources: [testSource]
  });
  return {
    schemaVersion: 1,
    id: "policy-matrix",
    name: "Synthetic policy matrix",
    baseSeed: 20261005,
    repetitions: 4,
    variants,
    sources: [testSource]
  };
}

function run() {
  return runExperiment({
    manifest: makeManifest(),
    createMatch: (variant, { matchId, seed }) => ({
      engine: new SyntheticRulesEngine(),
      initialState: createState(matchId, seed),
      policies: Object.fromEntries(
        Object.entries(variant.policyAssignments).map(([playerId, policyId]) => [
          playerId,
          policyRegistry[policyId]()
        ])
      ),
      maxSteps: 6,
      selectPlayer: (_state, stepIndex, playerIds) => playerIds[stepIndex % playerIds.length]
    })
  });
}

test("policy matrix creates full cartesian assignment set", () => {
  const variants = makeManifest().variants;
  assert.equal(variants.length, 4);
  assert.deepEqual(
    variants.map((variant) => variant.id),
    [
      "alpha=first-legal__beta=first-legal",
      "alpha=first-legal__beta=random-legal",
      "alpha=random-legal__beta=first-legal",
      "alpha=random-legal__beta=random-legal"
    ]
  );
});

test("paired experiment uses the same repetition seeds across variants", () => {
  const result = run();
  const firstSeeds = result.variants[0].batch.matches.map((match) => match.seed);
  for (const variant of result.variants.slice(1)) {
    assert.deepEqual(variant.batch.matches.map((match) => match.seed), firstSeeds);
  }
});

test("experiment result fingerprint is stable across repeated runs", () => {
  const first = run();
  const second = run();
  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(first, second);
});

test("telemetry fingerprint changes when records change", () => {
  const result = run();
  const telemetry = result.variants[0].batch.matches.map((match) => match.telemetry);
  const first = fingerprintTelemetry(telemetry);
  const changed = telemetry.map((match, index) =>
    index === 0 ? { ...match, stepCount: match.stepCount + 1 } : match
  );
  assert.notEqual(first, fingerprintTelemetry(changed));
});

test("fingerprint canonicalizes object key order", () => {
  assert.equal(fingerprintValue({ b: 2, a: 1 }), fingerprintValue({ a: 1, b: 2 }));
});

test("experiment manifests fail closed without provenance", () => {
  const manifest = makeManifest();
  assert.throws(
    () => validateExperimentManifest({ ...manifest, sources: [] }),
    /must include at least one provenance source/
  );
});

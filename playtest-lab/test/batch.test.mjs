import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "../dist/engine/state.js";
import { runSimulationBatch, deriveMatchSeed } from "../dist/simulation/batch.js";
import { RandomLegalPolicy } from "../dist/simulation/policy.js";
import { SyntheticRulesEngine } from "../dist/simulation/synthetic-engine.js";
import { serializeMatchTelemetryJsonl } from "../dist/simulation/telemetry.js";

function createDefinition({ matchId, seed }) {
  const initialState = createInitialGameState({
    gameId: matchId,
    seed,
    players: {
      alpha: {
        id: "alpha",
        factionId: "synthetic-a",
        command: 0,
        victoryPoints: 0,
        unitIds: []
      },
      beta: {
        id: "beta",
        factionId: "synthetic-b",
        command: 0,
        victoryPoints: 0,
        unitIds: []
      }
    }
  });

  return {
    engine: new SyntheticRulesEngine(),
    initialState,
    policies: {
      alpha: new RandomLegalPolicy(),
      beta: new RandomLegalPolicy()
    },
    maxSteps: 8,
    selectPlayer: (_state, stepIndex, playerIds) =>
      playerIds[stepIndex % playerIds.length]
  };
}

function batch() {
  return runSimulationBatch({
    batchId: "determinism",
    baseSeed: 2026,
    matchCount: 5,
    createMatch: createDefinition
  });
}

test("match seed derivation is stable and index-sensitive", () => {
  assert.equal(deriveMatchSeed(30, 0), deriveMatchSeed(30, 0));
  assert.notEqual(deriveMatchSeed(30, 0), deriveMatchSeed(30, 1));
  assert.throws(() => deriveMatchSeed(30, -1), /non-negative integer/);
});

test("batch runner is reproducible across repeated base seeds", () => {
  const first = batch();
  const second = batch();
  assert.deepEqual(first, second);
});

test("batch telemetry records generic actions and events without inventing a winner", () => {
  const result = batch();
  const match = result.matches[0];
  assert.ok(match);
  assert.equal(match.telemetry.stepCount, 8);
  assert.equal(match.telemetry.eventCount, 8);
  assert.equal(match.telemetry.actionTypeCounts["synthetic.noop"], 8);
  assert.equal(match.telemetry.eventTypeCounts["synthetic.noop.applied"], 8);
  assert.equal("winner" in match.telemetry, false);
  assert.deepEqual(
    match.telemetry.players.map((player) => player.selectedActions),
    [4, 4]
  );
  assert.deepEqual(
    match.telemetry.players.map((player) => player.finalCommand),
    [0, 0]
  );
  assert.deepEqual(
    match.telemetry.players.map((player) => player.startingDeployedUnits),
    [0, 0]
  );
  assert.deepEqual(
    match.telemetry.players.map((player) => player.startingActivationOpportunities),
    [0, 0]
  );
  assert.deepEqual(
    match.telemetry.players.map((player) => player.legalStartingDeploymentCapacity),
    [null, null]
  );
  assert.equal("finalCommandPoints" in match.telemetry.players[0], false);
});

test("telemetry JSONL is stable and one record per match", () => {
  const result = batch();
  const jsonl = serializeMatchTelemetryJsonl(result.matches.map((match) => match.telemetry));
  const lines = jsonl.split("\n");
  assert.equal(lines.length, 5);
  assert.equal(JSON.parse(lines[0]).schemaVersion, 5);
});

test("batch rejects factories whose state seed diverges from the derived match seed", () => {
  assert.throws(
    () =>
      runSimulationBatch({
        batchId: "bad-seed",
        baseSeed: 1,
        matchCount: 1,
        createMatch: ({ matchId }) => ({
          ...createDefinition({ matchId, seed: 999 }),
          initialState: createInitialGameState({ gameId: matchId, seed: 999 })
        })
      }),
    /does not match derived seed/
  );
});

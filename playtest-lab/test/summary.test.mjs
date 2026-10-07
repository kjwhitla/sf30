import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "../dist/engine/state.js";
import { runSimulationBatch } from "../dist/simulation/batch.js";
import { FirstLegalPolicy } from "../dist/simulation/policy.js";
import { SyntheticRulesEngine } from "../dist/simulation/synthetic-engine.js";
import { flattenBatchResult, serializeFlatSummaryCsv } from "../dist/simulation/summary.js";

function batch() {
  return runSimulationBatch({
    batchId: "summary-test",
    baseSeed: 55,
    matchCount: 2,
    createMatch: ({ matchId, seed }) => ({
      engine: new SyntheticRulesEngine(),
      initialState: createInitialGameState({
        gameId: matchId,
        seed,
        players: {
          alpha: { id: "alpha", factionId: "a", command: 0, victoryPoints: 0, unitIds: [] },
          beta: { id: "beta", factionId: "b", command: 0, victoryPoints: 0, unitIds: [] }
        }
      }),
      policies: { alpha: new FirstLegalPolicy(), beta: new FirstLegalPolicy() },
      maxSteps: 4,
      selectPlayer: (_state, stepIndex, playerIds) => playerIds[stepIndex % playerIds.length]
    })
  });
}

test("flat batch summary emits one row per player per match", () => {
  const rows = flattenBatchResult(batch());
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.playerId), ["alpha", "beta", "alpha", "beta"]);
});

test("flat summary CSV is stable and analysis-ready", () => {
  const csv = serializeFlatSummaryCsv(flattenBatchResult(batch()));
  const lines = csv.split("\n");
  assert.equal(lines.length, 5);
  assert.match(lines[0], /^batchId,matchId,matchIndex,seed/);
  assert.match(lines[0], /startingTerritorySlotCapacity/);
  assert.match(lines[0], /legalStartingDeploymentCapacity/);
  assert.match(lines[0], /cardGrantedDeploymentCapacity/);
  assert.match(lines[0], /actionEconomyException/);
  assert.match(lines[0], /startingDeployedUnits/);
  assert.match(lines[0], /startingActivationOpportunities/);
  assert.match(lines[0], /startingTerritoryIds/);
  assert.match(lines[0], /finalCommand/);
  assert.doesNotMatch(lines[0], /finalCommandPoints/);
  assert.match(lines[1], /summary-test:0/);
});

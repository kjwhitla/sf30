import { performance } from "node:perf_hooks";
import { createInitialGameState } from "../dist/engine/state.js";
import { runSimulationBatch } from "../dist/simulation/batch.js";
import { RandomLegalPolicy } from "../dist/simulation/policy.js";
import { SyntheticRulesEngine } from "../dist/simulation/synthetic-engine.js";
import { fingerprintTelemetry } from "../dist/simulation/experiment.js";

const matchCount = Number.parseInt(process.env.SF30_SMOKE_MATCHES ?? "10000", 10);
if (!Number.isInteger(matchCount) || matchCount < 1) {
  throw new Error("SF30_SMOKE_MATCHES must be a positive integer.");
}

const started = performance.now();
const result = runSimulationBatch({
  batchId: "synthetic-smoke",
  baseSeed: 20261005,
  matchCount,
  createMatch: ({ matchId, seed }) => ({
    engine: new SyntheticRulesEngine(),
    initialState: createInitialGameState({
      gameId: matchId,
      seed,
      players: {
        alpha: { id: "alpha", factionId: "synthetic-a", command: 0, victoryPoints: 0, unitIds: [] },
        beta: { id: "beta", factionId: "synthetic-b", command: 0, victoryPoints: 0, unitIds: [] }
      }
    }),
    policies: { alpha: new RandomLegalPolicy(), beta: new RandomLegalPolicy() },
    maxSteps: 8,
    selectPlayer: (_state, stepIndex, playerIds) => playerIds[stepIndex % playerIds.length]
  })
});
const elapsedMs = performance.now() - started;
const telemetry = result.matches.map((match) => match.telemetry);
const steps = telemetry.reduce((sum, match) => sum + match.stepCount, 0);

console.log(JSON.stringify({
  matchCount,
  steps,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  matchesPerSecond: Number((matchCount / (elapsedMs / 1000)).toFixed(2)),
  fingerprint: fingerprintTelemetry(telemetry)
}, null, 2));

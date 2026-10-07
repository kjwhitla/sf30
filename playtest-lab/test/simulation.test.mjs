import assert from "node:assert/strict";
import test from "node:test";
import { SeededRng } from "../dist/engine/rng.js";
import { createInitialGameState } from "../dist/engine/state.js";
import { FirstLegalPolicy } from "../dist/simulation/policy.js";
import { runSimulation } from "../dist/simulation/runner.js";
import { SyntheticRulesEngine } from "../dist/simulation/synthetic-engine.js";

function state() {
  return createInitialGameState({
    gameId: "simulation-test",
    seed: 30,
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
}

test("synthetic engine rejects stale actions", () => {
  const engine = new SyntheticRulesEngine();
  const initial = state();
  const action = engine.getLegalActions(initial, "alpha")[0];
  assert.ok(action);

  const advanced = { ...initial, eventSequence: 1 };
  const result = engine.applyAction(advanced, action, new SeededRng(1));
  assert.equal(result.accepted, false);
  assert.equal(result.error?.code, "STALE_ACTION");
});

test("synthetic engine advances sequence and emits one event", () => {
  const engine = new SyntheticRulesEngine();
  const initial = state();
  const action = engine.getLegalActions(initial, "alpha")[0];
  assert.ok(action);

  const result = engine.applyAction(initial, action, new SeededRng(1));
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.eventSequence, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.actorId, "alpha");
});

test("simulation runner uses injected player schedule and reaches max steps", () => {
  const engine = new SyntheticRulesEngine();
  const policy = new FirstLegalPolicy();
  const result = runSimulation({
    engine,
    initialState: state(),
    policies: { alpha: policy, beta: policy },
    rng: new SeededRng(30),
    maxSteps: 6,
    selectPlayer: (_state, stepIndex, playerIds) =>
      playerIds[stepIndex % playerIds.length]
  });

  assert.equal(result.stopReason, "max-steps");
  assert.equal(result.steps.length, 6);
  assert.equal(result.events.length, 6);
  assert.equal(result.finalState.eventSequence, 6);
  assert.deepEqual(
    result.steps.map((step) => step.playerId),
    ["alpha", "beta", "alpha", "beta", "alpha", "beta"]
  );
});

test("simulation runner refuses schedules that select an unconfigured player", () => {
  const engine = new SyntheticRulesEngine();
  const policy = new FirstLegalPolicy();

  assert.throws(
    () =>
      runSimulation({
        engine,
        initialState: state(),
        policies: { alpha: policy },
        rng: new SeededRng(30),
        maxSteps: 1,
        selectPlayer: () => "missing"
      }),
    /has no policy/
  );
});

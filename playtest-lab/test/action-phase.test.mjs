import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "../dist/engine/state.js";
import { beginRound, enterActionPhase } from "../dist/rules/round.js";
import { hasActiveBattlefieldUnit, resolvePostActionPriority } from "../dist/rules/action-phase.js";

const source = [{ id: "fixture", kind: "test-fixture", title: "Fixture", version: "1" }];

function definition(id, factionId) {
  return {
    id,
    name: id,
    factionId,
    unitClass: "TROOP",
    stars: null,
    flags: null,
    stats: { health: 2, shoot: 2, melee: 2, defense: 2, objectiveControl: 1, movement: 1 },
    abilityText: null,
    onDeathText: null,
    sources: source
  };
}

function unit(id, ownerId, territoryId, activation = "ready") {
  return {
    id,
    definitionId: id,
    ownerId,
    territoryId,
    wounds: 0,
    temporaryStatModifiers: [],
    currentHealth: 2,
    currentShoot: 2,
    currentMelee: 2,
    currentDefense: 2,
    currentObjectiveControl: 1,
    currentMovement: 1,
    activation,
    effectIds: []
  };
}

function buildState({ alphaA = "ready", alphaB = "ready", beta = "ready" } = {}) {
  const initial = createInitialGameState({
    gameId: "action-priority-test",
    seed: 30,
    players: {
      alpha: { id: "alpha", factionId: "a", command: 0, victoryPoints: 0, unitIds: ["alpha-a", "alpha-b"] },
      beta: { id: "beta", factionId: "b", command: 0, victoryPoints: 0, unitIds: ["beta-a"] }
    },
    unitDefinitions: {
      "alpha-a": definition("alpha-a", "a"),
      "alpha-b": definition("alpha-b", "a"),
      "beta-a": definition("beta-a", "b")
    },
    units: {
      "alpha-a": unit("alpha-a", "alpha", "t1", alphaA),
      "alpha-b": unit("alpha-b", "alpha", "t1", alphaB),
      "beta-a": unit("beta-a", "beta", "t2", beta)
    },
    territories: {
      t1: { id: "t1", name: "T1", territoryClass: "OBJECTIVE", occupantUnitIds: ["alpha-a", "alpha-b"], control: { kind: "uncontrolled", controlledBy: null }, activation: null, effectIds: [] },
      t2: { id: "t2", name: "T2", territoryClass: "OBJECTIVE", occupantUnitIds: ["beta-a"], control: { kind: "uncontrolled", controlledBy: null }, activation: null, effectIds: [] }
    },
    battlefieldTerritoryIds: ["t1", "t2"]
  });
  return enterActionPhase(beginRound(initial, "alpha").nextState).nextState;
}

test("active battlefield units are ready, on-field units only", () => {
  const state = buildState();
  const modified = {
    ...state,
    units: {
      ...state.units,
      "alpha-a": { ...state.units["alpha-a"], activation: "used" },
      "alpha-b": { ...state.units["alpha-b"], territoryId: null }
    }
  };
  assert.equal(hasActiveBattlefieldUnit(modified, "alpha"), false);
  assert.equal(hasActiveBattlefieldUnit(modified, "beta"), true);
});

test("post-action priority normally passes to the opponent", () => {
  const state = buildState();
  const postAction = {
    ...state,
    units: { ...state.units, "alpha-a": { ...state.units["alpha-a"], activation: "used" } }
  };
  const result = resolvePostActionPriority(postAction, "alpha");
  assert.equal(result.actionPhaseEnded, false);
  assert.equal(result.skippedUnavailableOpponent, false);
  assert.equal(result.roundFlow.priorityPlayerId, "beta");
  assert.equal(result.roundFlow.phase, "action");
});

test("priority lobs back when the opponent has no active unit", () => {
  const state = buildState();
  const postAction = {
    ...state,
    units: {
      ...state.units,
      "alpha-a": { ...state.units["alpha-a"], activation: "used" },
      "beta-a": { ...state.units["beta-a"], activation: "used" }
    }
  };
  const result = resolvePostActionPriority(postAction, "alpha");
  assert.equal(result.actionPhaseEnded, false);
  assert.equal(result.skippedUnavailableOpponent, true);
  assert.equal(result.roundFlow.priorityPlayerId, "alpha");
});

test("Action Phase ends when neither player has an active unit", () => {
  const state = buildState();
  const postAction = {
    ...state,
    units: {
      ...state.units,
      "alpha-a": { ...state.units["alpha-a"], activation: "used" },
      "alpha-b": { ...state.units["alpha-b"], activation: "used" },
      "beta-a": { ...state.units["beta-a"], activation: "used" }
    }
  };
  const result = resolvePostActionPriority(postAction, "alpha");
  assert.equal(result.actionPhaseEnded, true);
  assert.equal(result.roundFlow.phase, "end-round");
  assert.equal(result.roundFlow.priorityPlayerId, null);
});

import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "../dist/engine/state.js";
import { beginRound, enterActionPhase } from "../dist/rules/round.js";
import { applyDigIn, assessDigIn, getLegalDigInActions } from "../dist/rules/dig-in.js";
import { assertResolutionIntegrity } from "../dist/engine/transition.js";

const source = [{ id: "fixture", kind: "test-fixture", title: "Fixture", version: "1" }];

function definition(id, factionId) {
  return {
    id,
    name: id,
    factionId,
    unitClass: "TROOP",
    stars: null,
    flags: null,
    stats: { health: 3, shoot: 3, melee: 3, defense: 2, objectiveControl: 1, movement: 1 },
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
    currentHealth: 3,
    currentShoot: 3,
    currentMelee: 3,
    currentDefense: 2,
    currentObjectiveControl: 1,
    currentMovement: 1,
    activation,
    effectIds: []
  };
}

function buildState() {
  const initial = createInitialGameState({
    gameId: "dig-in-test",
    seed: 30,
    players: {
      alpha: { id: "alpha", factionId: "a", command: 0, victoryPoints: 0, unitIds: ["alpha-ready", "alpha-off"] },
      beta: { id: "beta", factionId: "b", command: 0, victoryPoints: 0, unitIds: ["beta-ready"] }
    },
    unitDefinitions: {
      "alpha-ready": definition("alpha-ready", "a"),
      "alpha-off": definition("alpha-off", "a"),
      "beta-ready": definition("beta-ready", "b")
    },
    units: {
      "alpha-ready": unit("alpha-ready", "alpha", "t1"),
      "alpha-off": unit("alpha-off", "alpha", null),
      "beta-ready": unit("beta-ready", "beta", "t2")
    },
    territories: {
      t1: { id: "t1", name: "T1", territoryClass: "OBJECTIVE", occupantUnitIds: ["alpha-ready"], control: { kind: "uncontrolled", controlledBy: null }, activation: null, effectIds: [] },
      t2: { id: "t2", name: "T2", territoryClass: "OBJECTIVE", occupantUnitIds: ["beta-ready"], control: { kind: "uncontrolled", controlledBy: null }, activation: null, effectIds: [] }
    },
    battlefieldTerritoryIds: ["t1", "t2"]
  });
  return enterActionPhase(beginRound(initial, "alpha").nextState).nextState;
}

test("Dig In is a legal base action for the active ready on-field unit", () => {
  const state = buildState();
  assert.deepEqual(getLegalDigInActions(state, "alpha").map((a) => a.payload.unitId), ["alpha-ready"]);
  assert.equal(assessDigIn(state, "alpha", "alpha-ready").status, "allowed");
});

test("Dig In obeys priority, ownership, readiness, and battlefield presence", () => {
  const state = buildState();
  assert.equal(assessDigIn(state, "alpha", "alpha-off").status, "blocked");
  assert.equal(assessDigIn(state, "beta", "beta-ready").status, "blocked");

  const used = {
    ...state,
    units: {
      ...state.units,
      "alpha-ready": { ...state.units["alpha-ready"], activation: "used" }
    }
  };
  assert.equal(assessDigIn(used, "alpha", "alpha-ready").status, "blocked");
});


test("Dig In resolution grants +2 DEF, deactivates the unit, and hands priority to the opponent", () => {
  const state = buildState();
  const action = getLegalDigInActions(state, "alpha")[0];
  assert.ok(action);

  const result = applyDigIn(state, action);
  assert.equal(result.accepted, true);
  assertResolutionIntegrity(state, result);
  assert.equal(result.nextState.units["alpha-ready"].currentDefense, 4);
  assert.equal(result.nextState.units["alpha-ready"].activation, "used");
  assert.deepEqual(result.nextState.units["alpha-ready"].temporaryStatModifiers, [
    {
      id: `dig-in:alpha-ready:${state.eventSequence + 1}`,
      stat: "defense",
      amount: 2,
      source: "action",
      label: "Dig In"
    }
  ]);
  assert.equal(result.nextState.roundFlow?.priorityPlayerId, "beta");
  assert.equal(result.events[0]?.type, "unit.dug-in");
  assert.deepEqual(result.events[0]?.payload, {
    unitId: "alpha-ready",
    defenseBonus: 2,
    expiresAt: "next-update-tokens"
  });
});

test("Dig In rejects stale canonical actions without mutating state", () => {
  const state = buildState();
  const action = getLegalDigInActions(state, "alpha")[0];
  assert.ok(action);
  const stale = { ...action, basedOnEventSequence: action.basedOnEventSequence - 1 };
  const result = applyDigIn(state, stale);
  assert.equal(result.accepted, false);
  assert.equal(result.error?.code, "STALE_ACTION");
  assert.equal(result.nextState, state);
  assert.deepEqual(result.events, []);
  assertResolutionIntegrity(state, result);
});


test("Dig In ends the Action Phase when neither player has an active unit", () => {
  const state = buildState();
  const noBeta = {
    ...state,
    units: {
      ...state.units,
      "beta-ready": { ...state.units["beta-ready"], activation: "used" }
    }
  };
  const action = getLegalDigInActions(noBeta, "alpha")[0];
  assert.ok(action);
  const result = applyDigIn(noBeta, action);
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.roundFlow?.phase, "end-round");
  assert.equal(result.nextState.roundFlow?.priorityPlayerId, null);
  assert.equal(result.events.at(-1)?.type, "phase.end-round.started");
  assertResolutionIntegrity(noBeta, result);
});

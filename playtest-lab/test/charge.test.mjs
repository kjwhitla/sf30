import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "../dist/engine/state.js";
import { SeededRng } from "../dist/engine/rng.js";
import { beginRound, enterActionPhase } from "../dist/rules/round.js";
import { applyCharge, assessCharge, getLegalChargeActions, resolveChargeRoll } from "../dist/rules/charge.js";

const source = [{ id: "fixture", kind: "test-fixture", title: "Fixture", version: "1" }];

function definition(id, factionId, { melee = 3 } = {}) {
  return {
    id,
    name: id,
    factionId,
    unitClass: "TROOP",
    stars: null,
    flags: null,
    stats: { health: 3, shoot: 2, melee, defense: 2, objectiveControl: 1, movement: 1 },
    abilityText: null,
    onDeathText: null,
    sources: source
  };
}

function unit(id, ownerId, territoryId, { melee = 3, activation = "ready" } = {}) {
  return {
    id,
    definitionId: id,
    ownerId,
    territoryId,
    wounds: 0,
    temporaryStatModifiers: [],
    currentHealth: 3,
    currentShoot: 2,
    currentMelee: melee,
    currentDefense: 2,
    currentObjectiveControl: 1,
    currentMovement: 1,
    activation,
    effectIds: []
  };
}

function territory(id, occupants = []) {
  return {
    id,
    name: id,
    territoryClass: "OBJECTIVE",
    occupantUnitIds: occupants,
    control: { kind: "uncontrolled", controlledBy: null },
    activation: null,
    effectIds: []
  };
}

function buildState({ attackerTerritory = "t1", targetTerritory = "t2", attackerMelee = 3, extraAlphaAtTarget = 0 } = {}) {
  const alphaIds = ["attacker"];
  const definitions = {
    attacker: definition("attacker", "a", { melee: attackerMelee }),
    target: definition("target", "b")
  };
  const units = {
    attacker: unit("attacker", "alpha", attackerTerritory, { melee: attackerMelee }),
    target: unit("target", "beta", targetTerritory)
  };
  const occupants = { t1: [], t2: [], t3: [], t4: [] };
  occupants[attackerTerritory].push("attacker");
  occupants[targetTerritory].push("target");

  for (let index = 0; index < extraAlphaAtTarget; index += 1) {
    const id = `alpha-extra-${index}`;
    alphaIds.push(id);
    definitions[id] = definition(id, "a");
    units[id] = unit(id, "alpha", targetTerritory);
    occupants[targetTerritory].push(id);
  }

  const initial = createInitialGameState({
    gameId: "charge-test",
    seed: 30,
    players: {
      alpha: { id: "alpha", factionId: "a", command: 0, victoryPoints: 0, unitIds: alphaIds },
      beta: { id: "beta", factionId: "b", command: 0, victoryPoints: 0, unitIds: ["target"] }
    },
    unitDefinitions: definitions,
    units,
    territories: {
      t1: territory("t1", occupants.t1),
      t2: territory("t2", occupants.t2),
      t3: territory("t3", occupants.t3),
      t4: territory("t4", occupants.t4)
    },
    battlefieldTerritoryIds: ["t1", "t2", "t3", "t4"]
  });
  return enterActionPhase(beginRound(initial, "alpha").nextState).nextState;
}

test("Charge targets enemies 1 or 2 Territories away", () => {
  assert.deepEqual(assessCharge(buildState({ targetTerritory: "t2" }), "alpha", "attacker", "target"), { status: "allowed", distance: 1 });
  assert.deepEqual(assessCharge(buildState({ targetTerritory: "t3" }), "alpha", "attacker", "target"), { status: "allowed", distance: 2 });
  const far = assessCharge(buildState({ targetTerritory: "t4" }), "alpha", "attacker", "target");
  assert.equal(far.status, "blocked");
  assert.equal(far.errors[0]?.code, "CHARGE_TARGET_OUT_OF_RANGE");
});

test("Charge is distinct from same-Territory Melee", () => {
  const same = assessCharge(buildState({ attackerTerritory: "t2", targetTerritory: "t2" }), "alpha", "attacker", "target");
  assert.equal(same.status, "blocked");
  assert.equal(same.errors[0]?.code, "CHARGE_TARGET_OUT_OF_RANGE");
});

test("Charge requires room in the charger's player zone at the target Territory", () => {
  const blocked = assessCharge(buildState({ extraAlphaAtTarget: 3 }), "alpha", "attacker", "target");
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.errors[0]?.code, "PLAYER_ZONE_FULL");
});

test("Charge requires an available MELEE stat because success enters Melee", () => {
  const blocked = assessCharge(buildState({ attackerMelee: null }), "alpha", "attacker", "target");
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.errors[0]?.code, "MELEE_STAT_NULL");
});

test("legal Charge action generation returns canonical target actions", () => {
  const state = buildState({ targetTerritory: "t3" });
  const actions = getLegalChargeActions(state, "alpha");
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, "unit.charge");
  assert.deepEqual(actions[0].payload, { attackerUnitId: "attacker", targetUnitId: "target" });
});

test("Charge roll succeeds when one Fate Die meets the traveled distance", () => {
  let sawSuccessAtOne = false;
  let sawFailureAtOne = false;
  let sawSuccessAtTwo = false;
  for (let seed = 1; seed <= 200; seed += 1) {
    const one = resolveChargeRoll(1, new SeededRng(seed));
    if (one.success) sawSuccessAtOne = true;
    else sawFailureAtOne = true;
    const two = resolveChargeRoll(2, new SeededRng(seed));
    if (two.success) sawSuccessAtTwo = true;
  }
  assert.equal(sawSuccessAtOne, true);
  assert.equal(sawFailureAtOne, true);
  assert.equal(sawSuccessAtTwo, true);
});


test("successful Charge moves first, deactivates the charger, and enters shared Melee", () => {
  const state = buildState({ targetTerritory: "t2" });
  const [action] = getLegalChargeActions(state, "alpha");
  const oneRng = { nextFloat: () => 0.4, nextInt: () => 2, pick: (items) => items[0] };
  const result = applyCharge(state, action, oneRng);
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.attacker.territoryId, "t2");
  assert.equal(result.nextState.units.attacker.activation, "used");
  assert.equal(result.nextState.pendingMelee?.sourceAction, "charge");
  assert.equal(result.nextState.pendingMelee?.phase, "initiator-strike");
  assert.equal(result.nextState.roundFlow.priorityPlayerId, "alpha", "priority waits for the ongoing Melee sequence");
});

test("failed Charge keeps the movement but does not enter Melee and hands priority onward", () => {
  const state = buildState({ targetTerritory: "t3" });
  const [action] = getLegalChargeActions(state, "alpha");
  const oneRng = { nextFloat: () => 0.4, nextInt: () => 2, pick: (items) => items[0] };
  const result = applyCharge(state, action, oneRng);
  assert.equal(result.accepted, true);
  assert.equal(result.events[0]?.payload.success, false);
  assert.equal(result.nextState.units.attacker.territoryId, "t3");
  assert.equal(result.nextState.pendingMelee, null);
  assert.equal(result.nextState.roundFlow.priorityPlayerId, "beta");
});

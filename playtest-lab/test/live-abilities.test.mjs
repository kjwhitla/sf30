import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "../dist/engine/state.js";
import { assertResolutionIntegrity } from "../dist/engine/transition.js";
import { beginRound, enterActionPhase } from "../dist/rules/round.js";
import { applyUnitAbility, getLegalUnitAbilityActions } from "../dist/rules/abilities.js";
import { assessMove } from "../dist/rules/movement.js";
import { applyCharge, getLegalChargeActions } from "../dist/rules/charge.js";
import {
  advancePendingMelee,
  applyMeleeAction,
  getLegalMeleeActions,
  getMeleeExchangeLimit,
  respondToPendingMelee
} from "../dist/rules/melee.js";
import { assessShoot, resolveShootDefense } from "../dist/rules/shooting.js";

const source = [{ id: "fixture", kind: "test-fixture", title: "Fixture", version: "1" }];
const noModifiers = { attackModifiers: [] };

function definition(id, factionId, unitClass = "TROOP", overrides = {}) {
  return {
    id,
    name: id,
    factionId,
    unitClass,
    stars: null,
    flags: null,
    stats: {
      health: overrides.health ?? 3,
      shoot: overrides.shoot ?? 3,
      melee: overrides.melee ?? 2,
      defense: overrides.defense ?? 2,
      objectiveControl: overrides.objectiveControl ?? 1,
      movement: overrides.movement ?? (unitClass === "VEHICLE" ? 2 : 1)
    },
    abilityText: overrides.abilityText ?? null,
    onDeathText: null,
    sources: source
  };
}

function unit(id, definitionId, ownerId, territoryId, overrides = {}) {
  return {
    id,
    definitionId,
    ownerId,
    territoryId,
    wounds: overrides.wounds ?? 0,
    temporaryStatModifiers: [],
    currentHealth: overrides.currentHealth ?? 3,
    currentShoot: overrides.currentShoot ?? 3,
    currentMelee: overrides.currentMelee ?? 2,
    currentDefense: overrides.currentDefense ?? 2,
    currentObjectiveControl: overrides.currentObjectiveControl ?? 1,
    currentMovement: overrides.currentMovement ?? 1,
    activation: overrides.activation ?? "ready",
    effectIds: []
  };
}

function territory(id, occupantUnitIds = []) {
  return {
    id,
    name: id,
    territoryClass: "OBJECTIVE",
    occupantUnitIds,
    control: { kind: "uncontrolled", controlledBy: null },
    activation: null,
    effectIds: []
  };
}

function actionState({ players, definitions, units, territories, order, firstPlayerId = "alpha" }) {
  const initial = createInitialGameState({
    gameId: "live-ability-test",
    seed: 30,
    players,
    unitDefinitions: definitions,
    units,
    territories,
    battlefieldTerritoryIds: order
  });
  return enterActionPhase(beginRound(initial, firstPlayerId).nextState).nextState;
}

function sequenceRng(indexes) {
  let cursor = 0;
  return {
    nextFloat: () => 0,
    nextInt: () => indexes[Math.min(cursor++, indexes.length - 1)] ?? 0,
    pick: (items) => items[0]
  };
}

test("Biomedic Field Surgeon exposes same/adjacent wounded non-Vehicle allies and removes one wound", () => {
  const definitions = {
    "iron-wake-biomedic": definition("iron-wake-biomedic", "a", "Support", { health: 2, shoot: 1, melee: 2, defense: 2 }),
    ally: definition("ally", "a", "TROOP"),
    vehicle: definition("vehicle", "a", "VEHICLE"),
    far: definition("far", "a", "TROOP"),
    enemy: definition("enemy", "b", "TROOP")
  };
  const units = {
    medic: unit("medic", "iron-wake-biomedic", "alpha", "t2", { currentHealth: 2, currentShoot: 1 }),
    ally: unit("ally", "ally", "alpha", "t3", { wounds: 1, currentHealth: 2, currentShoot: 2, currentMelee: 1, currentDefense: 1, currentObjectiveControl: 0 }),
    vehicle: unit("vehicle", "vehicle", "alpha", "t2", { wounds: 1, currentHealth: 2, currentMovement: 2 }),
    far: unit("far", "far", "alpha", "t4", { wounds: 1, currentHealth: 2 }),
    enemy: unit("enemy", "enemy", "beta", "t3", { wounds: 1, currentHealth: 2 })
  };
  const state = actionState({
    players: {
      alpha: { id: "alpha", factionId: "a", command: 0, victoryPoints: 0, unitIds: ["medic", "ally", "vehicle", "far"] },
      beta: { id: "beta", factionId: "b", command: 0, victoryPoints: 0, unitIds: ["enemy"] }
    },
    definitions,
    units,
    territories: {
      t1: territory("t1"),
      t2: territory("t2", ["medic", "vehicle"]),
      t3: territory("t3", ["ally", "enemy"]),
      t4: territory("t4", ["far"])
    },
    order: ["t1", "t2", "t3", "t4"]
  });

  const actions = getLegalUnitAbilityActions(state, "alpha");
  assert.deepEqual(actions.map((action) => action.payload.targetUnitId), ["ally"]);
  const result = applyUnitAbility(state, actions[0]);
  assert.equal(result.accepted, true);
  assertResolutionIntegrity(state, result);
  assert.equal(result.nextState.units.ally.wounds, 0);
  assert.equal(result.nextState.units.ally.currentHealth, 3);
  assert.equal(result.nextState.units.medic.activation, "used");
  assert.equal(result.nextState.roundFlow.priorityPlayerId, "beta");
  assert.equal(result.events[0]?.type, "unit.ability.resolved");
});

test("Warpers Phase Shift can Move to any Territory containing an allied unit but not arbitrary distant Territories", () => {
  const definitions = {
    "fatebound-warpers": definition("fatebound-warpers", "a", "Elite"),
    ally: definition("ally", "a"),
    enemy: definition("enemy", "b")
  };
  const units = {
    warper: unit("warper", "fatebound-warpers", "alpha", "t1"),
    ally: unit("ally", "ally", "alpha", "t4"),
    enemy: unit("enemy", "enemy", "beta", "t3")
  };
  const state = actionState({
    players: {
      alpha: { id: "alpha", factionId: "a", command: 0, victoryPoints: 0, unitIds: ["warper", "ally"] },
      beta: { id: "beta", factionId: "b", command: 0, victoryPoints: 0, unitIds: ["enemy"] }
    },
    definitions,
    units,
    territories: {
      t1: territory("t1", ["warper"]),
      t2: territory("t2"),
      t3: territory("t3", ["enemy"]),
      t4: territory("t4", ["ally"])
    },
    order: ["t1", "t2", "t3", "t4"]
  });
  assert.equal(assessMove(state, "alpha", "warper", "t4").status, "allowed");
  const blocked = assessMove(state, "alpha", "warper", "t3");
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.errors[0]?.code, "MOVE_DISTANCE_EXCEEDED");
});

test("Chain Blades Fury Unleashed rolls the Charge die twice and keeps the highest", () => {
  const definitions = {
    "iron-wake-chain-blades": definition("iron-wake-chain-blades", "a", "TROOP", { melee: 5 }),
    target: definition("target", "b")
  };
  const units = {
    chain: unit("chain", "iron-wake-chain-blades", "alpha", "t1", { currentMelee: 5 }),
    target: unit("target", "target", "beta", "t3")
  };
  const state = actionState({
    players: {
      alpha: { id: "alpha", factionId: "a", command: 0, victoryPoints: 0, unitIds: ["chain"] },
      beta: { id: "beta", factionId: "b", command: 0, victoryPoints: 0, unitIds: ["target"] }
    },
    definitions,
    units,
    territories: {
      t1: territory("t1", ["chain"]),
      t2: territory("t2"),
      t3: territory("t3", ["target"])
    },
    order: ["t1", "t2", "t3"]
  });
  const [action] = getLegalChargeActions(state, "alpha");
  const result = applyCharge(state, action, sequenceRng([0, 5]));
  assert.equal(result.accepted, true);
  assert.equal(result.events[0]?.payload.rollAttempts.length, 2);
  assert.equal(result.events[0]?.payload.rollTotal, 2);
  assert.equal(result.events[0]?.payload.success, true);
  assert.equal(result.nextState.pendingMelee?.sourceAction, "charge");
});

test("Royal Guard Shield Wall extends an otherwise normal Melee to a third exchange", () => {
  const definitions = {
    "iron-wake-royal-guard": definition("iron-wake-royal-guard", "a", "Elite", { melee: 1, defense: 2, health: 5 }),
    defender: definition("defender", "b", "TROOP", { melee: 1, defense: 2, health: 5 })
  };
  const units = {
    guard: unit("guard", "iron-wake-royal-guard", "alpha", "t1", { currentHealth: 5, currentMelee: 1, currentDefense: 2 }),
    defender: unit("defender", "defender", "beta", "t1", { currentHealth: 5, currentMelee: 1, currentDefense: 2 })
  };
  let state = actionState({
    players: {
      alpha: { id: "alpha", factionId: "a", command: 0, victoryPoints: 0, unitIds: ["guard"] },
      beta: { id: "beta", factionId: "b", command: 0, victoryPoints: 0, unitIds: ["defender"] }
    },
    definitions,
    units,
    territories: { t1: territory("t1", ["guard", "defender"]) },
    order: ["t1"]
  });
  assert.equal(getMeleeExchangeLimit(state, "guard", "defender"), 3);
  const [action] = getLegalMeleeActions(state, "alpha");
  state = applyMeleeAction(state, action).nextState;
  const maxDefense = sequenceRng([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);

  for (const expectedNextExchange of [2, 3]) {
    state = advancePendingMelee(state, maxDefense).nextState;
    state = respondToPendingMelee(state, {
      id: `respond:${state.eventSequence}`,
      type: "melee.respond",
      playerId: "beta",
      basedOnEventSequence: state.eventSequence,
      payload: { response: "melee" }
    }).nextState;
    state = advancePendingMelee(state, maxDefense).nextState;
    assert.equal(state.pendingMelee?.exchange, expectedNextExchange);
    assert.equal(state.pendingMelee?.phase, "initiator-strike");
  }
});

test("Silencers Hyperphase Shot makes the defender roll DEF twice and uses the lower result", () => {
  const definitions = {
    "fatebound-silencers": definition("fatebound-silencers", "a", "Support", { shoot: 5 }),
    target: definition("target", "b", "TROOP", { defense: 1 })
  };
  const units = {
    silencer: unit("silencer", "fatebound-silencers", "alpha", "t1", { currentShoot: 5 }),
    target: unit("target", "target", "beta", "t2", { currentDefense: 1 })
  };
  const state = actionState({
    players: {
      alpha: { id: "alpha", factionId: "a", command: 0, victoryPoints: 0, unitIds: ["silencer"] },
      beta: { id: "beta", factionId: "b", command: 0, victoryPoints: 0, unitIds: ["target"] }
    },
    definitions,
    units,
    territories: { t1: territory("t1", ["silencer"]), t2: territory("t2", ["target"]) },
    order: ["t1", "t2"]
  });
  const assessment = assessShoot(state, "alpha", "silencer", "target", noModifiers);
  assert.equal(assessment.status, "allowed");
  const result = resolveShootDefense(state, assessment, "target", sequenceRng([5, 0]), "silencer");
  assert.equal(result.status, "resolved");
  assert.deepEqual(result.defenseRollAttempts.map((roll) => roll.total), [2, 0]);
  assert.equal(result.defenseRoll.total, 0);
  assert.equal(result.damage, assessment.attackValue);
});

test("Biomedic Action Ability appears in the canonical legal-option projection", async () => {
  const { projectUnitLegalOptions } = await import("../dist/rules/legal-options.js");
  const definitions = {
    "iron-wake-biomedic": definition("iron-wake-biomedic", "a", "Support", { health: 2, shoot: 1, melee: 2, defense: 2 }),
    ally: definition("ally", "a"),
    enemy: definition("enemy", "b")
  };
  const units = {
    medic: unit("medic", "iron-wake-biomedic", "alpha", "t1", { currentHealth: 2, currentShoot: 1 }),
    ally: unit("ally", "ally", "alpha", "t1", { wounds: 1, currentHealth: 2 }),
    enemy: unit("enemy", "enemy", "beta", "t2")
  };
  const state = actionState({
    players: {
      alpha: { id: "alpha", factionId: "a", command: 0, victoryPoints: 0, unitIds: ["medic", "ally"] },
      beta: { id: "beta", factionId: "b", command: 0, victoryPoints: 0, unitIds: ["enemy"] }
    },
    definitions,
    units,
    territories: { t1: territory("t1", ["medic", "ally"]), t2: territory("t2", ["enemy"]) },
    order: ["t1", "t2"]
  });
  const projection = projectUnitLegalOptions(state, "alpha", "medic", () => ({ attackModifiers: [] }));
  assert.equal(projection.legalActionTypes.includes("unit.ability"), true);
  assert.deepEqual(projection.ability.targetUnitIds, ["ally"]);
});

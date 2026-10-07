import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "../dist/engine/state.js";
import { SeededRng } from "../dist/engine/rng.js";
import { beginRound, enterActionPhase } from "../dist/rules/round.js";
import {
  advanceAfterMeleeStrike,
  advancePendingMelee,
  applyMeleeAction,
  applyMeleeDefenderResponse,
  assessMelee,
  beginMeleeSequence,
  getLegalMeleeActions,
  resolveMeleeStrike,
  respondToPendingMelee
} from "../dist/rules/melee.js";

const source = [{ id: "fixture", kind: "test-fixture", title: "Fixture", version: "1" }];

function definition(id, factionId, { melee = 3, defense = 2 } = {}) {
  return {
    id,
    name: id,
    factionId,
    unitClass: "TROOP",
    stars: null,
    flags: null,
    stats: { health: 3, shoot: 2, melee, defense, objectiveControl: 1, movement: 1 },
    abilityText: null,
    onDeathText: null,
    sources: source
  };
}

function buildState({ sameTerritory = true, attackerMelee = 3, defenderDefense = 2, attackerReady = true } = {}) {
  const initial = createInitialGameState({
    gameId: "melee-test",
    seed: 11,
    players: {
      alpha: { id: "alpha", factionId: "a", command: 0, victoryPoints: 0, unitIds: ["attacker"] },
      beta: { id: "beta", factionId: "b", command: 0, victoryPoints: 0, unitIds: ["defender"] }
    },
    unitDefinitions: {
      attacker: definition("attacker", "a", { melee: attackerMelee, defense: 2 }),
      defender: definition("defender", "b", { melee: 2, defense: defenderDefense })
    },
    units: {
      attacker: {
        id: "attacker", definitionId: "attacker", ownerId: "alpha", territoryId: "t1",
        currentHealth: 3, currentShoot: 2, currentMelee: attackerMelee, currentDefense: 2,
        currentObjectiveControl: 1, activation: attackerReady ? "ready" : "used", effectIds: []
      },
      defender: {
        id: "defender", definitionId: "defender", ownerId: "beta", territoryId: sameTerritory ? "t1" : "t2",
        currentHealth: 3, currentShoot: 2, currentMelee: 2, currentDefense: defenderDefense,
        currentObjectiveControl: 1, activation: "ready", effectIds: []
      }
    },
    territories: {
      t1: {
        id: "t1", name: "T1", territoryClass: "OBJECTIVE",
        occupantUnitIds: sameTerritory ? ["attacker", "defender"] : ["attacker"],
        control: { kind: "contested", controlledBy: null }, activation: null, effectIds: []
      },
      t2: {
        id: "t2", name: "T2", territoryClass: "OBJECTIVE",
        occupantUnitIds: sameTerritory ? [] : ["defender"],
        control: { kind: "uncontrolled", controlledBy: null }, activation: null, effectIds: []
      }
    },
    battlefieldTerritoryIds: ["t1", "t2"]
  });
  const actionState = enterActionPhase(beginRound(initial, "alpha").nextState).nextState;
  if (attackerReady) return actionState;
  return {
    ...actionState,
    units: {
      ...actionState.units,
      attacker: { ...actionState.units.attacker, activation: "used" }
    }
  };
}

test("Melee only targets an enemy in the same Territory", () => {
  assert.equal(assessMelee(buildState(), "alpha", "attacker", "defender").status, "allowed");
  const blocked = assessMelee(buildState({ sameTerritory: false }), "alpha", "attacker", "defender");
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.errors[0]?.code, "MELEE_TARGET_NOT_SAME_TERRITORY");
});

test("legal Melee action generation respects activation priority and readiness", () => {
  assert.equal(getLegalMeleeActions(buildState(), "alpha").length, 1);
  assert.equal(getLegalMeleeActions(buildState({ attackerReady: false }), "alpha").length, 0);
});

test("Melee strike uses effective MELEE as Attack and Fate Dice Defense", () => {
  const result = resolveMeleeStrike(buildState({ attackerMelee: 4, defenderDefense: 1 }), "attacker", "defender", new SeededRng(1));
  assert.equal(result.status, "resolved");
  assert.equal(result.attackValue, 4);
  assert.equal(result.defenseRoll.dice.length, 1);
  assert.ok(result.damage >= 2);
});

test("Melee damage floors at zero when Defense result exceeds Attack", () => {
  const state = buildState({ attackerMelee: 1, defenderDefense: 6 });
  let floored = null;
  for (let seed = 1; seed < 100 && floored === null; seed += 1) {
    const result = resolveMeleeStrike(state, "attacker", "defender", new SeededRng(seed));
    if (result.status === "resolved" && result.defenseRoll.total > result.attackValue) floored = result;
  }
  assert.ok(floored);
  assert.equal(floored.damage, 0);
});

test("approved Melee sequence is initiator strike, defender choice, retaliation, then Exchange 2", () => {
  let sequence = beginMeleeSequence("attacker", "defender");
  assert.deepEqual(sequence, {
    initiatorUnitId: "attacker", defenderUnitId: "defender", exchange: 1,
    phase: "initiator-strike", completionReason: null
  });

  sequence = advanceAfterMeleeStrike(sequence, false);
  assert.equal(sequence.phase, "defender-choice");

  sequence = applyMeleeDefenderResponse(sequence, "melee");
  assert.equal(sequence.phase, "defender-strike");

  sequence = advanceAfterMeleeStrike(sequence, false);
  assert.equal(sequence.exchange, 2);
  assert.equal(sequence.phase, "initiator-strike");

  sequence = advanceAfterMeleeStrike(sequence, false);
  sequence = applyMeleeDefenderResponse(sequence, "melee");
  sequence = advanceAfterMeleeStrike(sequence, false);
  assert.equal(sequence.phase, "complete");
  assert.equal(sequence.completionReason, "exchange-limit");
});

test("Retreat ends Melee immediately", () => {
  let sequence = beginMeleeSequence("attacker", "defender");
  sequence = advanceAfterMeleeStrike(sequence, false);
  sequence = applyMeleeDefenderResponse(sequence, "retreat");
  assert.equal(sequence.phase, "complete");
  assert.equal(sequence.completionReason, "retreat");
});

test("destruction ends Melee before a response or next exchange", () => {
  const sequence = advanceAfterMeleeStrike(beginMeleeSequence("attacker", "defender"), true);
  assert.equal(sequence.phase, "complete");
  assert.equal(sequence.completionReason, "unit-destroyed");
});


test("Melee runtime sequence pauses only for the defender's sourced choice and completes two exchanges", () => {
  let state = buildState({ attackerMelee: 2, defenderDefense: 1 });
  const [action] = getLegalMeleeActions(state, "alpha");
  let result = applyMeleeAction(state, action);
  assert.equal(result.accepted, true);
  state = result.nextState;
  assert.equal(state.units.attacker.activation, "used");
  assert.equal(state.pendingMelee?.phase, "initiator-strike");

  const maxDefenseRng = { nextFloat: () => 0.99, nextInt: () => 5, pick: (items) => items[items.length - 1] };
  result = advancePendingMelee(state, maxDefenseRng);
  assert.equal(result.accepted, true);
  state = result.nextState;
  assert.equal(state.pendingMelee?.phase, "defender-choice");
  assert.equal(state.pendingMelee?.exchange, 1);

  result = respondToPendingMelee(state, {
    id: `melee.respond:defender:${state.eventSequence}`,
    type: "melee.respond",
    playerId: "beta",
    basedOnEventSequence: state.eventSequence,
    payload: { response: "melee" }
  });
  assert.equal(result.accepted, true);
  state = result.nextState;
  assert.equal(state.pendingMelee?.phase, "defender-strike");

  result = advancePendingMelee(state, maxDefenseRng);
  assert.equal(result.accepted, true);
  state = result.nextState;
  assert.equal(state.pendingMelee?.phase, "initiator-strike");
  assert.equal(state.pendingMelee?.exchange, 2);

  result = advancePendingMelee(state, maxDefenseRng);
  assert.equal(result.accepted, true);
  state = result.nextState;
  assert.equal(state.pendingMelee?.phase, "defender-choice");
  assert.equal(state.pendingMelee?.exchange, 2);

  result = respondToPendingMelee(state, {
    id: `melee.respond:defender:${state.eventSequence}`,
    type: "melee.respond",
    playerId: "beta",
    basedOnEventSequence: state.eventSequence,
    payload: { response: "melee" }
  });
  state = result.nextState;
  result = advancePendingMelee(state, maxDefenseRng);
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.pendingMelee, null);
  assert.equal(result.nextState.roundFlow.priorityPlayerId, "beta");
});

test("pending Melee blocks unrelated actions and a potentially lethal unresolved strike consumes no RNG", () => {
  const start = buildState({ attackerMelee: 3, defenderDefense: 1 });
  const [action] = getLegalMeleeActions(start, "alpha");
  const engaged = applyMeleeAction(start, action).nextState;
  assert.equal(getLegalMeleeActions(engaged, "alpha").length, 0);
  let rolls = 0;
  const rng = { nextFloat: () => 0, nextInt: () => { rolls += 1; return 0; }, pick: (items) => items[0] };
  const result = advancePendingMelee(engaged, rng);
  assert.equal(result.accepted, false);
  assert.equal(result.error?.code, "POTENTIAL_LETHAL_BRANCH_UNRESOLVED");
  assert.equal(rolls, 0);
});

test("explicit base destruction data allows Melee to destroy a Troop and complete the action", () => {
  const base = buildState({ attackerMelee: 3, defenderDefense: 1 });
  const state = {
    ...base,
    unitDefinitions: {
      ...base.unitDefinitions,
      defender: { ...base.unitDefinitions.defender, destroyedVictoryPoints: 1 }
    }
  };
  const [action] = getLegalMeleeActions(state, "alpha");
  let next = applyMeleeAction(state, action).nextState;
  const zeroDefenseRng = { nextFloat: () => 0, nextInt: () => 0, pick: (items) => items[0] };
  const result = advancePendingMelee(next, zeroDefenseRng);
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.pendingMelee, null);
  assert.equal(result.nextState.units.defender.territoryId, null);
  assert.equal(result.nextState.units.defender.offFieldZone, "reserves");
  assert.equal(result.nextState.players.alpha.victoryPoints, 1);
});

test("Retreat choice remains fail-closed until runtime Stronghold direction is represented", () => {
  let state = buildState({ attackerMelee: 2, defenderDefense: 1 });
  const [action] = getLegalMeleeActions(state, "alpha");
  state = applyMeleeAction(state, action).nextState;
  const maxDefenseRng = { nextFloat: () => 0.99, nextInt: () => 5, pick: (items) => items[items.length - 1] };
  state = advancePendingMelee(state, maxDefenseRng).nextState;
  const result = respondToPendingMelee(state, {
    id: `melee.respond:defender:${state.eventSequence}`,
    type: "melee.respond",
    playerId: "beta",
    basedOnEventSequence: state.eventSequence,
    payload: { response: "retreat" }
  });
  assert.equal(result.accepted, false);
  assert.equal(result.error?.code, "RETREAT_STRONGHOLD_UNRESOLVED");
  assert.equal(result.nextState, state);
});


test("Retreat moves one adjacent Territory toward the defender's sourced home Stronghold", () => {
  let state = buildState({ attackerMelee: 2, defenderDefense: 1 });
  state = {
    ...state,
    territories: {
      ...state.territories,
      t2: { ...state.territories.t2, territoryClass: "STRONGHOLD" }
    },
    scenario: {
      id: "retreat-scenario",
      name: "Retreat Scenario",
      round: 1,
      phase: "action",
      deployment: {
        maxFriendlyUnitsPerTerritory: 3,
        startingTerritoryIdsByPlayer: { alpha: ["t1"], beta: ["t2"] },
        actionEconomyException: false,
        startingTerritorySlotCapacityByPlayer: { alpha: 3, beta: 3 },
        legalStartingDeploymentCapacityByPlayer: { alpha: 1, beta: 1 },
        cardGrantedDeploymentCapacityByPlayer: { alpha: 0, beta: 0 }
      }
    }
  };
  const [action] = getLegalMeleeActions(state, "alpha");
  state = applyMeleeAction(state, action).nextState;
  const maxDefenseRng = { nextFloat: () => 0.99, nextInt: () => 5, pick: (items) => items[items.length - 1] };
  state = advancePendingMelee(state, maxDefenseRng).nextState;
  const result = respondToPendingMelee(state, {
    id: `melee.respond:defender:${state.eventSequence}`,
    type: "melee.respond",
    playerId: "beta",
    basedOnEventSequence: state.eventSequence,
    payload: { response: "retreat" }
  });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.pendingMelee, null);
  assert.equal(result.nextState.units.defender.territoryId, "t2");
  assert.equal(result.nextState.units.defender.activation, "used");
  assert.equal(result.nextState.territories.t1.occupantUnitIds.includes("defender"), false);
  assert.equal(result.nextState.territories.t2.occupantUnitIds.includes("defender"), true);
  assert.equal(result.events[0]?.type, "melee.retreat");
  assert.equal(result.events[0]?.payload.toTerritoryId, "t2");
});

test("Retreat with no Territory toward the home Stronghold destroys the defender when destruction is executable", () => {
  let state = buildState({ attackerMelee: 2, defenderDefense: 1 });
  state = {
    ...state,
    unitDefinitions: {
      ...state.unitDefinitions,
      defender: { ...state.unitDefinitions.defender, destroyedVictoryPoints: 1 }
    },
    territories: {
      ...state.territories,
      t1: { ...state.territories.t1, territoryClass: "STRONGHOLD" }
    },
    scenario: {
      id: "retreat-destroy",
      name: "Retreat Destroy",
      round: 1,
      phase: "action",
      deployment: {
        maxFriendlyUnitsPerTerritory: 3,
        startingTerritoryIdsByPlayer: { alpha: ["t2"], beta: ["t1"] },
        actionEconomyException: false,
        startingTerritorySlotCapacityByPlayer: { alpha: 3, beta: 3 },
        legalStartingDeploymentCapacityByPlayer: { alpha: 1, beta: 1 },
        cardGrantedDeploymentCapacityByPlayer: { alpha: 0, beta: 0 }
      }
    }
  };
  const [action] = getLegalMeleeActions(state, "alpha");
  state = applyMeleeAction(state, action).nextState;
  const maxDefenseRng = { nextFloat: () => 0.99, nextInt: () => 5, pick: (items) => items[items.length - 1] };
  state = advancePendingMelee(state, maxDefenseRng).nextState;
  const result = respondToPendingMelee(state, {
    id: `melee.respond:defender:${state.eventSequence}`,
    type: "melee.respond",
    playerId: "beta",
    basedOnEventSequence: state.eventSequence,
    payload: { response: "retreat" }
  });
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.defender.territoryId, null);
  assert.equal(result.nextState.units.defender.offFieldZone, "reserves");
  assert.equal(result.nextState.players.alpha.victoryPoints, 1);
  assert.equal(result.events[0]?.payload.destroyed, true);
});

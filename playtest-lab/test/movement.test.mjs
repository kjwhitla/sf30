import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "../dist/engine/state.js";
import { assessMove, getBaseMoveDistance, getLegalMoveActions } from "../dist/rules/movement.js";
import { beginRound, enterActionPhase } from "../dist/rules/round.js";

const fixtureSource = [{ id: "fixture", kind: "test-fixture", title: "Fixture", version: "1" }];

function definition(id, unitClass) {
  return {
    id,
    name: id,
    factionId: "a",
    unitClass,
    stars: null,
    flags: null,
    stats: { health: 2, shoot: 2, melee: 2, defense: 2, objectiveControl: 1, movement: unitClass === "VEHICLE" ? 2 : 1 },
    abilityText: null,
    onDeathText: null,
    sources: fixtureSource
  };
}

function buildState({ vehicle = false, middleEnemy = false, destinationOwn = 0 } = {}) {
  const units = {
    mover: {
      id: "mover", definitionId: vehicle ? "vehicle" : "troop", ownerId: "alpha", territoryId: "t1",
      currentHealth: 2, currentShoot: 2, currentMelee: 2, currentDefense: 2, currentObjectiveControl: 1, activation: "ready", effectIds: []
    }
  };
  const players = {
    alpha: { id: "alpha", factionId: "a", command: 0, victoryPoints: 0, unitIds: ["mover"] },
    beta: { id: "beta", factionId: "b", command: 0, victoryPoints: 0, unitIds: [] }
  };
  const t2 = [];
  const t3 = [];

  if (middleEnemy) {
    units.enemy = {
      id: "enemy", definitionId: "enemy", ownerId: "beta", territoryId: "t2",
      currentHealth: 2, currentShoot: 2, currentMelee: 2, currentDefense: 2, currentObjectiveControl: 1, activation: "ready", effectIds: []
    };
    players.beta.unitIds = ["enemy"];
    t2.push("enemy");
  }
  for (let index = 0; index < destinationOwn; index += 1) {
    const id = `friend-${index}`;
    units[id] = {
      id, definitionId: "troop", ownerId: "alpha", territoryId: "t3",
      currentHealth: 2, currentShoot: 2, currentMelee: 2, currentDefense: 2, currentObjectiveControl: 1, activation: "ready", effectIds: []
    };
    players.alpha.unitIds.push(id);
    t3.push(id);
  }

  const initial = createInitialGameState({
    gameId: "move-test",
    seed: 1,
    players,
    unitDefinitions: {
      troop: definition("troop", "TROOP"),
      vehicle: definition("vehicle", "VEHICLE"),
      enemy: { ...definition("enemy", "TROOP"), factionId: "b" }
    },
    units,
    territories: {
      t1: { id: "t1", name: "T1", territoryClass: "OBJECTIVE", occupantUnitIds: ["mover"], control: { kind: "uncontrolled", controlledBy: null }, activation: null, effectIds: [] },
      t2: { id: "t2", name: "T2", territoryClass: "OBJECTIVE", occupantUnitIds: t2, control: { kind: "uncontrolled", controlledBy: null }, activation: null, effectIds: [] },
      t3: { id: "t3", name: "T3", territoryClass: "OBJECTIVE", occupantUnitIds: t3, control: { kind: "uncontrolled", controlledBy: null }, activation: null, effectIds: [] }
    },
    battlefieldTerritoryIds: ["t1", "t2", "t3"]
  });
  return enterActionPhase(beginRound(initial, "alpha").nextState).nextState;
}

test("base movement is 1 for non-Vehicles and up to 2 for Vehicles", () => {
  assert.equal(getBaseMoveDistance(definition("troop", "TROOP")), 1);
  assert.equal(getBaseMoveDistance(definition("vehicle", "VEHICLE")), 2);
});

test("non-Vehicle gets adjacent Move actions only", () => {
  const actions = getLegalMoveActions(buildState(), "alpha");
  assert.deepEqual(actions.map((action) => action.payload.destinationTerritoryId), ["t2"]);
});

test("Vehicle can move two territories through a clear or friendly path", () => {
  const state = buildState({ vehicle: true });
  assert.equal(assessMove(state, "alpha", "mover", "t3").status, "allowed");
});

test("Vehicle can pass through an enemy-occupied intermediate Territory", () => {
  const state = buildState({ vehicle: true, middleEnemy: true });
  const assessment = assessMove(state, "alpha", "mover", "t3");
  assert.equal(assessment.status, "allowed");
});

test("territory unit limit is enforced per player zone, not total occupants", () => {
  const state = buildState({ vehicle: true, destinationOwn: 3 });
  const assessment = assessMove(state, "alpha", "mover", "t3");
  assert.equal(assessment.status, "blocked");
  assert.equal(assessment.errors[0]?.code, "PLAYER_ZONE_FULL");
});

test("Move resolution updates occupancy, control, deactivates the mover, and hands priority over", async () => {
  const { applyMove } = await import("../dist/rules/movement.js");
  const { assertResolutionIntegrity } = await import("../dist/engine/transition.js");
  const state = buildState();
  const action = getLegalMoveActions(state, "alpha")[0];
  assert.ok(action);

  const result = applyMove(state, action);
  assert.equal(result.accepted, true);
  assertResolutionIntegrity(state, result);
  assert.equal(result.nextState.units.mover.territoryId, "t2");
  assert.equal(result.nextState.units.mover.activation, "used");
  assert.deepEqual(result.nextState.territories.t1.occupantUnitIds, []);
  assert.deepEqual(result.nextState.territories.t2.occupantUnitIds, ["mover"]);
  assert.deepEqual(result.nextState.territories.t1.control, { kind: "uncontrolled", controlledBy: null });
  assert.deepEqual(result.nextState.territories.t2.control, { kind: "controlled", controlledBy: "alpha" });
  assert.equal(result.nextState.roundFlow?.phase, "end-round");
  assert.equal(result.nextState.roundFlow?.priorityPlayerId, null);
  assert.equal(result.events[0]?.type, "unit.moved");
  assert.deepEqual(result.events[0]?.payload, {
    unitId: "mover",
    fromTerritoryId: "t1",
    toTerritoryId: "t2",
    distance: 1
  });
});

test("Move resolution hands priority to an opponent with an active unit", async () => {
  const { applyMove } = await import("../dist/rules/movement.js");
  const state = buildState({ middleEnemy: true });
  const action = getLegalMoveActions(state, "alpha").find((item) => item.payload.destinationTerritoryId === "t2");
  assert.ok(action);
  const result = applyMove(state, action);
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.roundFlow?.phase, "action");
  assert.equal(result.nextState.roundFlow?.priorityPlayerId, "beta");
  assert.deepEqual(result.nextState.territories.t2.control, { kind: "contested", controlledBy: null });
});

test("Move resolution accepts a Vehicle two-territory move through an enemy without inventing a pass-through effect", async () => {
  const { applyMove } = await import("../dist/rules/movement.js");
  const state = buildState({ vehicle: true, middleEnemy: true });
  const action = getLegalMoveActions(state, "alpha").find((item) => item.payload.destinationTerritoryId === "t3");
  assert.ok(action);
  const result = applyMove(state, action);
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.mover.territoryId, "t3");
  assert.equal(result.events[0]?.type, "unit.moved");
  assert.equal(result.events.some((event) => String(event.type).includes("pass")), false);
});

test("Move resolution rejects stale actions without state mutation", async () => {
  const { applyMove } = await import("../dist/rules/movement.js");
  const { assertResolutionIntegrity } = await import("../dist/engine/transition.js");
  const state = buildState();
  const action = getLegalMoveActions(state, "alpha")[0];
  assert.ok(action);
  const result = applyMove(state, { ...action, basedOnEventSequence: action.basedOnEventSequence - 1 });
  assert.equal(result.accepted, false);
  assert.equal(result.error?.code, "STALE_ACTION");
  assert.equal(result.nextState, state);
  assertResolutionIntegrity(state, result);
});

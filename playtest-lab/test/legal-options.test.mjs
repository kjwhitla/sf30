import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "../dist/engine/state.js";
import { beginRound, enterActionPhase } from "../dist/rules/round.js";
import {
  assessUnitSelection,
  getSelectableUnitIds,
  projectUnitLegalOptions
} from "../dist/rules/legal-options.js";

const source = [{ id: "fixture", kind: "test-fixture", title: "Fixture", version: "1" }];
const noModifiers = () => ({ attackModifiers: [] });

function definition(id, factionId, { shoot = 4, melee = 3, movement = 1 } = {}) {
  return {
    id,
    name: id,
    factionId,
    unitClass: movement === 2 ? "VEHICLE" : "TROOP",
    stars: null,
    flags: null,
    stats: { health: 3, shoot, melee, defense: 2, objectiveControl: 1, movement },
    abilityText: null,
    onDeathText: null,
    sources: source
  };
}

function unit(id, definitionId, ownerId, territoryId, { shoot = 4, melee = 3, movement = 1, activation = "ready" } = {}) {
  return {
    id,
    definitionId,
    ownerId,
    territoryId,
    wounds: 0,
    temporaryStatModifiers: [],
    currentHealth: 3,
    currentShoot: shoot,
    currentMelee: melee,
    currentDefense: 2,
    currentObjectiveControl: 1,
    currentMovement: movement,
    activation,
    effectIds: []
  };
}

function territory(id, occupantUnitIds) {
  return {
    id,
    name: id.toUpperCase(),
    territoryClass: "OBJECTIVE",
    occupantUnitIds,
    control: { kind: "uncontrolled", controlledBy: null },
    activation: null,
    effectIds: []
  };
}

function buildState({ alphaReady = true } = {}) {
  const alphaShoot = 4;
  const initial = createInitialGameState({
    gameId: "legal-options-test",
    seed: 30,
    players: {
      alpha: { id: "alpha", factionId: "a", command: 0, victoryPoints: 0, unitIds: ["alpha-main", "alpha-used"] },
      beta: { id: "beta", factionId: "b", command: 0, victoryPoints: 0, unitIds: ["beta-close", "beta-far"] }
    },
    unitDefinitions: {
      "alpha-main": definition("alpha-main", "a", { shoot: alphaShoot, melee: 3, movement: 1 }),
      "alpha-used": definition("alpha-used", "a"),
      "beta-close": definition("beta-close", "b"),
      "beta-far": definition("beta-far", "b")
    },
    units: {
      "alpha-main": unit("alpha-main", "alpha-main", "alpha", "t2", { shoot: alphaShoot, activation: alphaReady ? "ready" : "used" }),
      "alpha-used": unit("alpha-used", "alpha-used", "alpha", "t1", { activation: "used" }),
      "beta-close": unit("beta-close", "beta-close", "beta", "t2"),
      "beta-far": unit("beta-far", "beta-far", "beta", "t4")
    },
    territories: {
      t1: territory("t1", ["alpha-used"]),
      t2: territory("t2", ["alpha-main", "beta-close"]),
      t3: territory("t3", []),
      t4: territory("t4", ["beta-far"])
    },
    battlefieldTerritoryIds: ["t1", "t2", "t3", "t4"]
  });
  return enterActionPhase(beginRound(initial, "alpha").nextState).nextState;
}

test("selectable units follow Action Phase priority, ownership, readiness, and battlefield presence", () => {
  const state = buildState();
  assert.deepEqual(getSelectableUnitIds(state, "alpha"), ["alpha-main", "alpha-used"], "beginRound reactivates on-field units");

  const usedState = {
    ...state,
    units: {
      ...state.units,
      "alpha-used": { ...state.units["alpha-used"], activation: "used" }
    }
  };
  assert.deepEqual(getSelectableUnitIds(usedState, "alpha"), ["alpha-main"]);
  assert.equal(assessUnitSelection(usedState, "alpha", "alpha-used").status, "blocked");
  assert.equal(assessUnitSelection(usedState, "beta", "beta-close").status, "blocked");
});

test("selected unit projection reuses canonical actions for legal destinations and targets", () => {
  const state = buildState();
  const projection = projectUnitLegalOptions(state, "alpha", "alpha-main", noModifiers);

  assert.equal(projection.selectable, true);
  assert.deepEqual(projection.legalActionTypes, ["unit.move", "unit.shoot", "unit.melee", "unit.charge", "unit.dig-in"]);
  assert.deepEqual(projection.move.destinationTerritoryIds, ["t1", "t3"]);
  assert.deepEqual(projection.shoot.targetUnitIds, ["beta-close", "beta-far"]);
  assert.deepEqual(projection.melee.targetUnitIds, ["beta-close"]);
  assert.deepEqual(projection.charge.targetUnitIds, ["beta-far"]);
  assert.equal(projection.digIn.actions.length, 1);
  assert.equal(projection.digIn.actions[0]?.payload.unitId, "alpha-main");

  assert.ok(projection.legalActions.every((action) => action.playerId === "alpha"));
  assert.ok(
    projection.legalActions.every((action) =>
      action.type === "unit.move" || action.type === "unit.dig-in"
        ? action.payload.unitId === "alpha-main"
        : action.payload.attackerUnitId === "alpha-main"
    )
  );
});

test("unresolved ATTACK=0 Shoot choices are not misrepresented as legal options", () => {
  const state = buildState();
  const projection = projectUnitLegalOptions(state, "alpha", "alpha-main", () => ({
    attackModifiers: [{ id: "test-zero", amount: -4, source: "other" }]
  }));

  assert.deepEqual(projection.shoot.targetUnitIds, []);
  assert.equal(projection.legalActionTypes.includes("unit.shoot"), false);
  assert.deepEqual(projection.melee.targetUnitIds, ["beta-close"]);
  assert.deepEqual(projection.charge.targetUnitIds, ["beta-far"]);
  assert.equal(projection.digIn.actions.length, 1);
  assert.equal(projection.digIn.actions[0]?.payload.unitId, "alpha-main");
});

test("blocked unit selection returns no projected actions", () => {
  const state = buildState();
  const blockedState = {
    ...state,
    units: {
      ...state.units,
      "alpha-main": { ...state.units["alpha-main"], activation: "used" }
    }
  };
  const projection = projectUnitLegalOptions(blockedState, "alpha", "alpha-main", noModifiers);
  assert.equal(projection.selectable, false);
  assert.equal(projection.selectionErrors[0]?.code, "UNIT_DEACTIVATED");
  assert.deepEqual(projection.legalActions, []);
});

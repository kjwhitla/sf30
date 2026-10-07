import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "../dist/engine/state.js";
import {
  assessTerritoryObjectiveControl,
  recalculateStandardTerritoryControl
} from "../dist/rules/objective-control.js";

const source = [{ id: "fixture", kind: "test-fixture", title: "Fixture", version: "1" }];

function buildState({ alphaOc = [], betaOc = [] } = {}) {
  const unitDefinitions = {};
  const units = {};
  const occupantUnitIds = [];
  const alphaUnitIds = [];
  const betaUnitIds = [];

  for (const [ownerId, values, ownedIds] of [
    ["alpha", alphaOc, alphaUnitIds],
    ["beta", betaOc, betaUnitIds]
  ]) {
    values.forEach((oc, index) => {
      const definitionId = `${ownerId}-d${index}`;
      const unitId = `${ownerId}-u${index}`;
      unitDefinitions[definitionId] = {
        id: definitionId,
        name: unitId,
        factionId: ownerId,
        unitClass: "TROOP",
        stars: null,
        flags: null,
        stats: {
          health: 2,
          shoot: 1,
          melee: 1,
          defense: 1,
          objectiveControl: oc,
          movement: 1
        },
        abilityText: null,
        onDeathText: null,
        sources: source
      };
      units[unitId] = {
        id: unitId,
        definitionId,
        ownerId,
        territoryId: "t1",
        wounds: 0,
        temporaryStatModifiers: [],
        currentHealth: 2,
        currentShoot: 1,
        currentMelee: 1,
        currentDefense: 1,
        currentObjectiveControl: oc,
        currentMovement: 1,
        activation: "ready",
        effectIds: []
      };
      occupantUnitIds.push(unitId);
      ownedIds.push(unitId);
    });
  }

  return createInitialGameState({
    gameId: "objective-control-test",
    seed: 30,
    players: {
      alpha: { id: "alpha", factionId: "alpha", command: 0, victoryPoints: 0, unitIds: alphaUnitIds },
      beta: { id: "beta", factionId: "beta", command: 0, victoryPoints: 0, unitIds: betaUnitIds }
    },
    unitDefinitions,
    units,
    territories: {
      t1: {
        id: "t1",
        name: "Objective",
        territoryClass: "OBJECTIVE",
        occupantUnitIds,
        control: { kind: "uncontrolled", controlledBy: null },
        activation: null,
        effectIds: []
      },
      t2: {
        id: "t2",
        name: "Empty",
        territoryClass: "OBJECTIVE",
        occupantUnitIds: [],
        control: { kind: "controlled", controlledBy: "alpha" },
        activation: null,
        effectIds: []
      }
    },
    battlefieldTerritoryIds: ["t1", "t2"]
  });
}

test("Objective Control sums all contributing friendly units on a Territory", () => {
  const assessment = assessTerritoryObjectiveControl(
    buildState({ alphaOc: [2, 1], betaOc: [1] }),
    "t1"
  );

  assert.deepEqual(assessment.objectiveControlByPlayer, { alpha: 3, beta: 1 });
  assert.equal(assessment.highestObjectiveControl, 3);
  assert.deepEqual(assessment.leadingPlayerIds, ["alpha"]);
  assert.deepEqual(assessment.control, { kind: "controlled", controlledBy: "alpha" });
});

test("equal positive opposing Objective Control is Contested", () => {
  const assessment = assessTerritoryObjectiveControl(
    buildState({ alphaOc: [2], betaOc: [1, 1] }),
    "t1"
  );

  assert.deepEqual(assessment.objectiveControlByPlayer, { alpha: 2, beta: 2 });
  assert.deepEqual(assessment.control, { kind: "contested", controlledBy: null });
});

test("a Territory with no positive Objective Control is Uncontrolled", () => {
  const state = buildState();
  assert.deepEqual(
    assessTerritoryObjectiveControl(state, "t1").control,
    { kind: "uncontrolled", controlledBy: null }
  );
});

test("null, zero, and destroyed-unit OC do not create standard control", () => {
  const state = buildState({ alphaOc: [1], betaOc: [1] });
  const modified = {
    ...state,
    units: {
      ...state.units,
      "alpha-u0": { ...state.units["alpha-u0"], currentObjectiveControl: null },
      "beta-u0": { ...state.units["beta-u0"], currentHealth: 0 }
    }
  };

  const assessment = assessTerritoryObjectiveControl(modified, "t1");
  assert.deepEqual(assessment.objectiveControlByPlayer, { alpha: 0, beta: 0 });
  assert.deepEqual(assessment.control, { kind: "uncontrolled", controlledBy: null });
});

test("standard Territory control can be recalculated across the battlefield without scoring", () => {
  const state = buildState({ alphaOc: [2], betaOc: [1] });
  const recalculated = recalculateStandardTerritoryControl(state);

  assert.deepEqual(recalculated.territories.t1.control, {
    kind: "controlled",
    controlledBy: "alpha"
  });
  assert.deepEqual(recalculated.territories.t2.control, {
    kind: "uncontrolled",
    controlledBy: null
  });
  assert.equal(recalculated.players.alpha.victoryPoints, 0, "control derivation does not score VP");
  assert.equal(recalculated.eventSequence, state.eventSequence, "derived control update emits no gameplay event");
});

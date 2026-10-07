import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "../dist/engine/state.js";
import { assertStateInvariants, validateStateInvariants } from "../dist/engine/invariants.js";

function validState() {
  return createInitialGameState({
    gameId: "invariant-test",
    seed: 7,
    players: {
      "player-a": {
        id: "player-a",
        factionId: "test-faction",
        command: 0,
        victoryPoints: 0,
        unitIds: ["unit-1"]
      }
    },
    unitDefinitions: {
      "test.unit": {
        id: "test.unit",
        name: "Synthetic Test Unit",
        factionId: "test-faction",
        unitClass: "TestClass",
        stars: null,
        flags: null,
        stats: { health: 1, shoot: 1, melee: 1, defense: 1, objectiveControl: 1, movement: 1 },
        abilityText: null,
        onDeathText: null,
        sources: [
          { id: "fixture:v1", kind: "test-fixture", title: "Synthetic test fixture", version: "1" }
        ]
      }
    },
    units: {
      "unit-1": {
        id: "unit-1",
        definitionId: "test.unit",
        ownerId: "player-a",
        territoryId: "territory-a",
        currentHealth: 1,
        currentShoot: 1,
        currentMelee: 1,
        currentDefense: 1,
        currentObjectiveControl: 1,
        activation: "ready",
        effectIds: []
      }
    },
    territories: {
      "territory-a": {
        id: "territory-a",
        name: "Synthetic Test Territory",
        territoryClass: "TestTerritoryClass",
        occupantUnitIds: ["unit-1"],
        control: { kind: "uncontrolled", controlledBy: null },
        activation: null,
        effectIds: []
      }
    }
  });
}

test("consistent state passes structural invariants", () => {
  const state = validState();
  assert.deepEqual(validateStateInvariants(state), []);
  assert.doesNotThrow(() => assertStateInvariants(state));
});

test("unit/territory asymmetry is detected", () => {
  const state = validState();
  const broken = {
    ...state,
    territories: {
      ...state.territories,
      "territory-a": {
        ...state.territories["territory-a"],
        occupantUnitIds: []
      }
    }
  };

  const issues = validateStateInvariants(broken);
  assert.ok(issues.some((item) => item.code === "UNIT_TERRITORY_ASYMMETRY"));
});

test("controlled territory must point to an existing player", () => {
  const state = validState();
  const broken = {
    ...state,
    territories: {
      ...state.territories,
      "territory-a": {
        ...state.territories["territory-a"],
        control: { kind: "controlled", controlledBy: "missing-player" }
      }
    }
  };

  const issues = validateStateInvariants(broken);
  assert.ok(issues.some((item) => item.code === "CONTROL_PLAYER_MISSING"));
});


test("unit definitions require provenance at runtime", () => {
  const state = validState();
  const broken = {
    ...state,
    unitDefinitions: {
      ...state.unitDefinitions,
      "test.unit": { ...state.unitDefinitions["test.unit"], sources: [] }
    }
  };

  const issues = validateStateInvariants(broken);
  assert.ok(issues.some((item) => item.code === "UNIT_DEFINITION_SOURCE_MISSING"));
});

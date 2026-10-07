import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialGameState,
  deserializeGameState,
  serializeGameState
} from "../dist/engine/state.js";

const testPlayer = {
  id: "player-a",
  factionId: "test-faction",
  command: 0,
  victoryPoints: 0,
  unitIds: ["unit-1"]
};

const testDefinition = {
  id: "test.unit",
  name: "Synthetic Test Unit",
  factionId: "test-faction",
  unitClass: "TestClass",
  stars: 3,
  flags: null,
  stats: {
    health: 1,
    shoot: 1,
    melee: 3,
    defense: 0,
    objectiveControl: 1,
    movement: 0
  },
  abilityText: null,
  onDeathText: null,
  sources: [{ id: "fixture:v1", kind: "test-fixture", title: "Synthetic test fixture", version: "1" }]
};

const testUnit = {
  id: "unit-1",
  definitionId: "test.unit",
  ownerId: "player-a",
  territoryId: "territory-a",
  currentHealth: 1,
  currentShoot: 1,
  currentMelee: 3,
  currentDefense: 0,
  currentObjectiveControl: 1,
  activation: "ready",
  effectIds: []
};

const testTerritory = {
  id: "territory-a",
  name: "Synthetic Test Territory",
  territoryClass: "TestTerritoryClass",
  occupantUnitIds: ["unit-1"],
  control: {
    kind: "uncontrolled",
    controlledBy: null
  },
  activation: "ready",
  effectIds: []
};

test("initial state is browser-independent and JSON serializable", () => {
  const state = createInitialGameState({
    gameId: "test-game",
    seed: 30,
    players: { "player-a": testPlayer },
    unitDefinitions: { "test.unit": testDefinition },
    units: { "unit-1": testUnit },
    territories: { "territory-a": testTerritory }
  });

  assert.equal(state.schemaVersion, 7);
  assert.equal(state.lifecycle, "setup");
  assert.equal(state.players["player-a"]?.factionId, "test-faction");
  assert.equal(state.units["unit-1"]?.territoryId, "territory-a");

  const roundTrip = deserializeGameState(serializeGameState(state));
  assert.deepEqual(roundTrip, state);
});

test("invalid serialized envelope is rejected", () => {
  assert.throws(
    () => deserializeGameState('{"schemaVersion":999,"gameId":"bad"}'),
    /schemaVersion/
  );
});


test("deserialization rejects structurally invalid state", () => {
  const state = createInitialGameState({
    gameId: "valid-first",
    seed: 1
  });
  const broken = {
    ...state,
    unitDefinitions: {
      bad: {
        id: "bad",
        name: "Synthetic",
        factionId: "synthetic",
        unitClass: "Synthetic",
        stars: null,
        flags: null,
        stats: { health: 0, shoot: 0, melee: 0, defense: 0, objectiveControl: 1, movement: 0 },
        abilityText: null,
        onDeathText: null,
        sources: []
      }
    }
  };
  assert.throws(() => deserializeGameState(JSON.stringify(broken)), /UNIT_DEFINITION_SOURCE_MISSING/);
});

test("schema v2 state migrates to v7 current state fields on deserialize", () => {
  const legacy = {
    schemaVersion: 2,
    gameId: "legacy-v2",
    seed: 30,
    lifecycle: "setup",
    players: {
      "player-a": {
        id: "player-a", factionId: "test-faction", commandPoints: 2, victoryPoints: 0, unitIds: ["unit-1"]
      }
    },
    unitDefinitions: { "test.unit": { ...testDefinition, stats: { ...testDefinition.stats, movement: 1 } } },
    units: {
      "unit-1": {
        ...testUnit,
        currentHealth: 0
      }
    },
    territories: { "territory-a": testTerritory },
    battlefieldTerritoryIds: ["territory-a"],
    roundFlow: null,
    scenario: null,
    eventSequence: 0
  };

  const migrated = deserializeGameState(JSON.stringify(legacy));
  assert.equal(migrated.schemaVersion, 7);
  assert.equal(migrated.players["player-a"].command, 2);
  assert.equal(migrated.units["unit-1"].wounds, 1);
  assert.deepEqual(migrated.units["unit-1"].temporaryStatModifiers, []);
  assert.equal(migrated.units["unit-1"].currentMovement, 1);
  assert.equal(migrated.pendingMelee, null);
});

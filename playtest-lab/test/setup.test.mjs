import assert from "node:assert/strict";
import test from "node:test";
import { createGameStateFromCatalog } from "../dist/data/setup.js";

const fixtureSource = {
  id: "fixture:v1",
  kind: "test-fixture",
  title: "Synthetic catalog fixture",
  version: "1"
};

const canonicalSource = {
  id: "owner:v1",
  kind: "owner-decision",
  title: "Synthetic authoritative decision",
  version: "1"
};

function catalog(source = fixtureSource) {
  return {
    factions: {
      faction: { id: "faction", name: "Faction", sources: [source] }
    },
    units: {
      unit: {
        id: "unit",
        name: "Unit",
        factionId: "faction",
        unitClass: "Test",
        stars: null,
        flags: null,
        stats: { health: 2, shoot: 1, melee: 1, defense: 3, objectiveControl: 1, movement: 1 },
        abilityText: null,
        onDeathText: null,
        sources: [source]
      }
    },
    territories: {
      territory: {
        id: "territory",
        name: "Territory",
        territoryClass: "Test",
        rulesText: [],
        sources: [source]
      }
    },
    dice: {},
    scenarios: {
      scenario: {
        id: "scenario",
        name: "Scenario",
        rulesText: [],
        sources: [source]
      }
    }
  };
}

function setup(sourcePolicy) {
  return {
    gameId: "setup-test",
    seed: 99,
    sourcePolicy,
    players: [
      {
        id: "alpha",
        factionId: "faction",
        command: 0,
        victoryPoints: 0,
        unitIds: ["alpha-unit"]
      }
    ],
    units: [
      {
        id: "alpha-unit",
        definitionId: "unit",
        ownerId: "alpha",
        territoryId: "territory",
        currentHealth: 2,
        currentShoot: 1,
        currentMelee: 1,
        currentDefense: 3,
        currentObjectiveControl: 1,
        activation: "ready",
        effectIds: []
      }
    ],
    battlefieldTerritoryIds: ["territory"],
    territories: [
      {
        id: "territory",
        occupantUnitIds: ["alpha-unit"],
        control: { kind: "controlled", controlledBy: "alpha" },
        activation: "ready",
        effectIds: []
      }
    ],
    scenario: { id: "scenario", round: null, phase: null }
  };
}

test("catalog setup fails closed on test-fixture provenance by default", () => {
  assert.throws(
    () => createGameStateFromCatalog(catalog(), setup(undefined)),
    /no authoritative executable source/
  );
});

test("catalog setup allows explicit test-fixture mode for harness tests", () => {
  const state = createGameStateFromCatalog(catalog(), setup("allow-test-fixtures"));
  assert.equal(state.gameId, "setup-test");
  assert.equal(state.unitDefinitions.unit.name, "Unit");
  assert.equal(state.territories.territory.name, "Territory");
  assert.equal(state.scenario?.name, "Scenario");
});

test("catalog setup accepts authoritative sourced definitions", () => {
  const state = createGameStateFromCatalog(catalog(canonicalSource), setup(undefined));
  assert.equal(state.units["alpha-unit"].definitionId, "unit");
});

test("catalog setup rejects unknown mutable-state references before simulation", () => {
  const invalid = setup("allow-test-fixtures");
  invalid.units[0] = { ...invalid.units[0], definitionId: "missing" };
  assert.throws(
    () => createGameStateFromCatalog(catalog(), invalid),
    /missing definition/
  );
});


test("catalog setup rejects duplicate runtime ids instead of silently overwriting", () => {
  const duplicate = setup("allow-test-fixtures");
  duplicate.players.push({ ...duplicate.players[0] });
  assert.throws(
    () => createGameStateFromCatalog(catalog(), duplicate),
    /duplicate player id/
  );
});

test("catalog setup enforces sourced scenario deployment invariants when present", () => {
  const sourcedCatalog = catalog(canonicalSource);
  sourcedCatalog.scenarios.scenario = {
    ...sourcedCatalog.scenarios.scenario,
    deployment: {
      standardDeployment: true,
      maxFriendlyUnitsPerTerritory: 3,
      deployToLegalCapacity: true,
      actionEconomyException: false,
      startingTerritoryIdsByFaction: { faction: [] }
    }
  };
  assert.throws(
    () => createGameStateFromCatalog(sourcedCatalog, setup(undefined)),
    /MISSING_STARTING_TERRITORIES/
  );
});

test("catalog setup stores calculated legal deployment capacity in scenario state", () => {
  const sourcedCatalog = catalog(canonicalSource);
  sourcedCatalog.scenarios.scenario = {
    ...sourcedCatalog.scenarios.scenario,
    deployment: {
      standardDeployment: true,
      maxFriendlyUnitsPerTerritory: 3,
      deployToLegalCapacity: true,
      actionEconomyException: false,
      startingTerritoryIdsByFaction: { faction: ["territory"] }
    }
  };
  const state = createGameStateFromCatalog(sourcedCatalog, setup(undefined));
  assert.deepEqual(state.scenario?.deployment?.startingTerritoryIdsByPlayer.alpha, ["territory"]);
  assert.equal(state.scenario?.deployment?.startingTerritorySlotCapacityByPlayer.alpha, 3);
  assert.equal(state.scenario?.deployment?.legalStartingDeploymentCapacityByPlayer.alpha, 1);
  assert.equal(state.scenario?.deployment?.cardGrantedDeploymentCapacityByPlayer.alpha, 0);
});

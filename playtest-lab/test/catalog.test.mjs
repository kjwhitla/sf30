import assert from "node:assert/strict";
import test from "node:test";
import { loadGameCatalog } from "../dist/data/catalog.js";

const source = {
  id: "fixture:v1",
  kind: "test-fixture",
  title: "Synthetic catalog fixture",
  version: "1"
};

function fixtureCatalog() {
  return {
    factions: {
      "test-faction": { id: "test-faction", name: "Synthetic Faction", sources: [source] }
    },
    units: {
      "test-unit": {
        id: "test-unit",
        name: "Synthetic Unit",
        factionId: "test-faction",
        unitClass: "SyntheticClass",
        stars: null,
        flags: null,
        stats: { health: 1, shoot: 1, melee: 1, defense: 1, objectiveControl: 1, movement: 1 },
        abilityText: null,
        onDeathText: null,
        sources: [source]
      }
    },
    territories: {
      "test-territory": {
        id: "test-territory",
        name: "Synthetic Territory",
        territoryClass: "SyntheticClass",
        rulesText: [],
        sources: [source]
      }
    },
    dice: {
      "test-die": {
        id: "test-die",
        name: "Synthetic Die",
        faces: [
          { id: "face-1", symbols: ["synthetic-symbol"] },
          { id: "face-2", symbols: [] }
        ],
        sources: [source]
      }
    },
    scenarios: {
      "test-scenario": {
        id: "test-scenario",
        name: "Synthetic Scenario",
        rulesText: [],
        sources: [source]
      }
    }
  };
}

test("catalog loader accepts sourced synthetic definitions", () => {
  const catalog = fixtureCatalog();
  assert.equal(loadGameCatalog(catalog), catalog);
});

test("catalog loader rejects definitions without provenance", () => {
  const catalog = fixtureCatalog();
  catalog.units["test-unit"] = { ...catalog.units["test-unit"], sources: [] };
  assert.throws(() => loadGameCatalog(catalog), /provenance source/);
});

test("catalog loader rejects a unit referencing a missing faction", () => {
  const catalog = fixtureCatalog();
  catalog.units["test-unit"] = {
    ...catalog.units["test-unit"],
    factionId: "missing-faction"
  };
  assert.throws(() => loadGameCatalog(catalog), /missing faction/);
});

test("catalog loader rejects duplicate die face ids", () => {
  const catalog = fixtureCatalog();
  catalog.dice["test-die"] = {
    ...catalog.dice["test-die"],
    faces: [
      { id: "same", symbols: [] },
      { id: "same", symbols: [] }
    ]
  };
  assert.throws(() => loadGameCatalog(catalog), /duplicate face id/);
});

test("catalog JSON round-trip preserves sourced content", async () => {
  const { serializeGameCatalog, deserializeGameCatalog } = await import("../dist/data/catalog.js");
  const catalog = fixtureCatalog();
  assert.deepEqual(deserializeGameCatalog(serializeGameCatalog(catalog)), catalog);
});

test("catalog JSON loader rejects missing source arrays", async () => {
  const { deserializeGameCatalog } = await import("../dist/data/catalog.js");
  const catalog = fixtureCatalog();
  delete catalog.scenarios["test-scenario"].sources;
  assert.throws(() => deserializeGameCatalog(JSON.stringify(catalog)), /must include sources/);
});

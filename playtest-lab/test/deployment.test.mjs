import assert from "node:assert/strict";
import test from "node:test";
import { assessDeploymentInvariant } from "../dist/rules/deployment.js";

const standardRules = {
  standardDeployment: true,
  maxFriendlyUnitsPerTerritory: 3,
  deployToLegalCapacity: true,
  actionEconomyException: false,
  startingTerritoryIdsByFaction: {
    "iron-wake": ["t1", "t2"],
    fatebound: ["t4", "t5"]
  }
};

const territories = ["t1", "t2", "t3", "t4", "t5"].map((id) => ({ id }));

function buildSide(playerId, factionId, territoryIds, count = 6, definitionId = "line-unit") {
  const units = Array.from({ length: count }, (_, index) => ({
    id: `${playerId}-${index + 1}`,
    definitionId,
    ownerId: playerId,
    territoryId: territoryIds[index % territoryIds.length]
  }));
  return {
    player: { id: playerId, factionId, unitIds: units.map((unit) => unit.id) },
    units
  };
}

function standardFixture() {
  const ironWake = buildSide("iw", "iron-wake", ["t1", "t2"]);
  const fatebound = buildSide("fb", "fatebound", ["t4", "t5"]);
  return {
    rules: standardRules,
    players: [ironWake.player, fatebound.player],
    units: [...ironWake.units, ...fatebound.units],
    territories
  };
}

test("two three-slot starting territories commonly produce six legal starting slots", () => {
  const result = assessDeploymentInvariant(standardFixture());
  assert.equal(result.ok, true);
  assert.deepEqual(result.deployedCountByPlayer, { iw: 6, fb: 6 });
  assert.deepEqual(result.startingTerritorySlotCapacityByPlayer, { iw: 6, fb: 6 });
  assert.deepEqual(result.legalStartingDeploymentCapacityByPlayer, { iw: 6, fb: 6 });
});

test("territory allotment determines legal starting deployment capacity", () => {
  const fixture = standardFixture();
  fixture.rules = {
    ...fixture.rules,
    startingTerritoryIdsByFaction: {
      "iron-wake": ["t1"],
      fatebound: ["t5"]
    }
  };
  fixture.units = fixture.units.map((unit) => {
    if (unit.ownerId === "iw") {
      const index = Number(unit.id.split("-").at(-1));
      return { ...unit, territoryId: index <= 3 ? "t1" : null };
    }
    const index = Number(unit.id.split("-").at(-1));
    return { ...unit, territoryId: index <= 3 ? "t5" : null };
  });
  const result = assessDeploymentInvariant(fixture);
  assert.equal(result.ok, true);
  assert.deepEqual(result.legalStartingDeploymentCapacityByPlayer, { iw: 3, fb: 3 });
  assert.deepEqual(result.deployedCountByPlayer, { iw: 3, fb: 3 });
});

test("under-deployment means starting below actual legal capacity", () => {
  const fixture = standardFixture();
  fixture.units = fixture.units.map((unit) =>
    unit.ownerId === "iw" && ["iw-5", "iw-6"].includes(unit.id)
      ? { ...unit, territoryId: null }
      : unit
  );
  const result = assessDeploymentInvariant(fixture);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.code === "ACCIDENTAL_UNDER_DEPLOYMENT"));
  assert.ok(result.warnings.some((item) => item.code === "UNEQUAL_STARTING_ACTION_ECONOMY"));
});

test("resolved card deployment rules can expand legal placement beyond normal starting Territory slots", () => {
  const fixture = standardFixture();
  fixture.rules = {
    ...fixture.rules,
    startingTerritoryIdsByFaction: {
      "iron-wake": ["t1"],
      fatebound: ["t5"]
    },
    additionalStartingTerritoryIdsByUnitDefinition: {
      scout: ["t2", "t4"]
    }
  };
  fixture.units = fixture.units.map((unit) => {
    const index = Number(unit.id.split("-").at(-1));
    if (unit.ownerId === "iw") {
      if (index <= 3) return { ...unit, territoryId: "t1" };
      return { ...unit, definitionId: "scout", territoryId: "t2" };
    }
    if (index <= 3) return { ...unit, territoryId: "t5" };
    return { ...unit, definitionId: "scout", territoryId: "t4" };
  });
  const result = assessDeploymentInvariant(fixture);
  assert.equal(result.ok, true);
  assert.deepEqual(result.startingTerritorySlotCapacityByPlayer, { iw: 3, fb: 3 });
  assert.deepEqual(result.legalStartingDeploymentCapacityByPlayer, { iw: 6, fb: 6 });
  assert.deepEqual(result.cardGrantedDeploymentCapacityByPlayer, { iw: 3, fb: 3 });
});

test("three allotted starting Territories can support more than six starting units when the army contains them", () => {
  const ironWake = buildSide("iw", "iron-wake", ["t1", "t2", "t3"], 8);
  const fatebound = buildSide("fb", "fatebound", ["t3", "t4", "t5"], 8);
  const result = assessDeploymentInvariant({
    rules: {
      ...standardRules,
      startingTerritoryIdsByFaction: {
        "iron-wake": ["t1", "t2", "t3"],
        fatebound: ["t3", "t4", "t5"]
      }
    },
    players: [ironWake.player, fatebound.player],
    units: [...ironWake.units, ...fatebound.units],
    territories
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.startingTerritorySlotCapacityByPlayer, { iw: 9, fb: 9 });
  assert.deepEqual(result.legalStartingDeploymentCapacityByPlayer, { iw: 8, fb: 8 });
  assert.deepEqual(result.deployedCountByPlayer, { iw: 8, fb: 8 });
});

test("card-specific legal starting territory is accepted for the matching unit definition", () => {
  const fixture = standardFixture();
  fixture.rules = {
    ...fixture.rules,
    additionalStartingTerritoryIdsByUnitDefinition: { scout: ["t3"] }
  };
  fixture.units = fixture.units.map((unit) =>
    unit.id === "iw-6" ? { ...unit, definitionId: "scout", territoryId: "t3" } : unit
  );
  const result = assessDeploymentInvariant(fixture);
  assert.equal(result.ok, true);
});

test("scenario-created unequal base starting capacity must be explicit asymmetry", () => {
  const fixture = standardFixture();
  fixture.rules = {
    ...fixture.rules,
    startingTerritoryIdsByFaction: {
      "iron-wake": ["t1"],
      fatebound: ["t4", "t5"]
    }
  };
  fixture.units = fixture.units.map((unit) => {
    if (unit.ownerId !== "iw") return unit;
    const index = Number(unit.id.split("-").at(-1));
    return { ...unit, territoryId: index <= 3 ? "t1" : null };
  });
  const result = assessDeploymentInvariant(fixture);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.code === "UNFLAGGED_ASYMMETRIC_STARTING_TERRITORY_CAPACITY"));
});

test("explicit Action Economy Exceptions may intentionally use reduced unequal deployment", () => {
  const fixture = standardFixture();
  fixture.rules = {
    ...fixture.rules,
    standardDeployment: false,
    actionEconomyException: true,
    exceptionReason: "Defender begins understrength and receives a Round 2 relief force."
  };
  fixture.units = fixture.units.map((unit) =>
    unit.ownerId === "iw" && ["iw-5", "iw-6"].includes(unit.id)
      ? { ...unit, territoryId: null }
      : unit
  );
  const result = assessDeploymentInvariant(fixture);
  assert.equal(result.ok, true);
  assert.deepEqual(result.deployedCountByPlayer, { iw: 4, fb: 6 });
  assert.ok(result.warnings.some((item) => item.code === "UNEQUAL_STARTING_ACTION_ECONOMY"));
});

test("per-territory capacity is enforced per player's force", () => {
  const fixture = standardFixture();
  fixture.units = fixture.units.map((unit) =>
    unit.ownerId === "iw" ? { ...unit, territoryId: "t1" } : unit
  );
  const result = assessDeploymentInvariant(fixture);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.code === "FRIENDLY_TERRITORY_CAPACITY_EXCEEDED"));
});

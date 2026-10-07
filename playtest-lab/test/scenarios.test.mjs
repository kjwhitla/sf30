import assert from "node:assert/strict";
import test from "node:test";
import {
  FATEBOUND_FACTION_ID,
  INITIAL_SCENARIOS,
  INITIAL_SCENARIOS_BY_ID,
  IRON_WAKE_FACTION_ID,
  deriveStartingTerritorySlotCapacity,
  validateInitialScenarioSet
} from "../dist/data/scenarios.js";

test("initial scenario suite contains the eight supplied scenarios", () => {
  validateInitialScenarioSet();
  assert.equal(INITIAL_SCENARIOS.length, 8);
  assert.deepEqual(
    INITIAL_SCENARIOS.map((scenario) => scenario.name),
    [
      "Point of Domination",
      "Signal in the Fog",
      "Minefield Run",
      "Breach the Line",
      "Extraction Corridor",
      "Stronghold Assault",
      "Scorched Front",
      "Sector Collapse"
    ]
  );
});

test("six starting slots are derived from two three-slot Territories, not a global cap", () => {
  const baseline = INITIAL_SCENARIOS_BY_ID["point-of-domination"];
  assert.ok(baseline);
  assert.equal(deriveStartingTerritorySlotCapacity(baseline, IRON_WAKE_FACTION_ID), 6);
  assert.equal(deriveStartingTerritorySlotCapacity(baseline, FATEBOUND_FACTION_ID), 6);
  assert.equal("deploymentCapacityPerPlayer" in baseline, false);
  assert.equal("standardStartingUnitCap" in baseline, false);
});

test("scenario definitions preserve unresolved mechanics as text rather than executable rules", () => {
  const stronghold = INITIAL_SCENARIOS_BY_ID["stronghold-assault"];
  assert.ok(stronghold);
  assert.equal(stronghold.executableStatus, "deployment-structure-only");
  assert.equal(stronghold.vpThreshold, null);
  assert.ok(stronghold.territoryAbilities.some((text) => text.includes("tuning values")));
});

test("sector collapse correctly represents 6+ territories using a minimum range", () => {
  const scenario = INITIAL_SCENARIOS_BY_ID["sector-collapse"];
  assert.ok(scenario);
  assert.deepEqual(scenario.territoryCount, { min: 6, max: null });
  assert.equal(scenario.territorySlots.length, 6);
});

test("scenario validation rejects starting slots that are not on the battlefield", () => {
  const base = INITIAL_SCENARIOS[0];
  assert.ok(base);
  const invalid = {
    ...base,
    startingSlotIdsByFaction: {
      ...base.startingSlotIdsByFaction,
      [IRON_WAKE_FACTION_ID]: ["T99"]
    }
  };
  assert.throws(() => validateInitialScenarioSet([invalid]), /not in its battlefield/);
});

test("scenario slots link to Territory Library identities without coercing custom locations", () => {
  const baseline = INITIAL_SCENARIOS_BY_ID["point-of-domination"];
  const siege = INITIAL_SCENARIOS_BY_ID["stronghold-assault"];
  assert.ok(baseline && siege);
  assert.deepEqual(
    baseline.territorySlots.map((slot) => slot.territoryDefinitionId),
    ["iron-wake-stronghold", "standard-objective", "standard-objective", "fatebound-stronghold"]
  );
  assert.deepEqual(
    siege.territorySlots.map((slot) => slot.territoryDefinitionId),
    [null, null, "breach-zone", "fortified-stronghold", null]
  );
});

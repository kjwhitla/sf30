import assert from "node:assert/strict";
import test from "node:test";
import { recalculateUnitState } from "../dist/rules/stats.js";

const definition = {
  id: "d", name: "Unit", factionId: "f", unitClass: "TROOP", stars: null, flags: null,
  stats: { health: 4, shoot: 4, melee: 3, defense: 3, objectiveControl: 2, movement: 1 },
  abilityText: null, onDeathText: null,
  sources: [{ id: "fixture", kind: "test-fixture", title: "Fixture", version: "1" }]
};

function unit(overrides = {}) {
  return {
    id: "u", definitionId: "d", ownerId: "p", territoryId: "t",
    wounds: 2,
    temporaryStatModifiers: [{ id: "stale", stat: "shoot", amount: 5, source: "token" }],
    currentHealth: 99, currentShoot: 99, currentMelee: 99, currentDefense: 99,
    currentObjectiveControl: 99, currentMovement: 99,
    activation: "ready", effectIds: [],
    ...overrides
  };
}

test("effective stats rebuild from printed values, persistent wounds, and current modifiers", () => {
  const recalculated = recalculateUnitState(definition, unit(), [
    { id: "terrain", stat: "defense", amount: 1, source: "environment" },
    { id: "orders", stat: "objectiveControl", amount: 1, source: "ability" },
    { id: "speed", stat: "movement", amount: 1, source: "action" }
  ]);

  assert.equal(recalculated.wounds, 2);
  assert.equal(recalculated.currentHealth, 2);
  assert.equal(recalculated.currentShoot, 2);
  assert.equal(recalculated.currentMelee, 1);
  assert.equal(recalculated.currentDefense, 2);
  assert.equal(recalculated.currentObjectiveControl, 3);
  assert.equal(recalculated.currentMovement, 2);
  assert.equal(recalculated.temporaryStatModifiers.length, 3);
});

test("non-null combat stats floor at one while null stats remain null", () => {
  const nullShoot = { ...definition, stats: { ...definition.stats, shoot: null, defense: 1 } };
  const recalculated = recalculateUnitState(nullShoot, unit({ wounds: 5 }), []);
  assert.equal(recalculated.currentShoot, null);
  assert.equal(recalculated.currentMelee, 1);
  assert.equal(recalculated.currentDefense, 1);
  assert.equal(recalculated.currentHealth, -1, "Health is not subject to the non-Health stat floor");
});

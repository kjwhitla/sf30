import assert from "node:assert/strict";
import test from "node:test";
import { SeededRng } from "../dist/engine/rng.js";
import { createInitialGameState } from "../dist/engine/state.js";
import { beginRound, enterActionPhase } from "../dist/rules/round.js";
import { applyShoot, assessShoot, getLegalShootActions, resolveShootDefense } from "../dist/rules/shooting.js";

const source = [{ id: "fixture", kind: "test-fixture", title: "Fixture", version: "1" }];
const noModifiers = () => ({ attackModifiers: [] });

function definition(id, factionId, shoot = 3, defense = 2) {
  return {
    id, name: id, factionId, unitClass: "TROOP", stars: null, flags: null,
    stats: { health: 3, shoot, melee: 2, defense, objectiveControl: 1, movement: 1 },
    abilityText: null, onDeathText: null, sources: source
  };
}

function buildState({ shoot = 3, targetTerritory = "t3", defense = 2 } = {}) {
  const initial = createInitialGameState({
    gameId: "shoot-test",
    seed: 7,
    players: {
      alpha: { id: "alpha", factionId: "a", command: 0, victoryPoints: 0, unitIds: ["attacker"] },
      beta: { id: "beta", factionId: "b", command: 0, victoryPoints: 0, unitIds: ["target"] }
    },
    unitDefinitions: {
      attacker: definition("attacker", "a", shoot, 2),
      target: definition("target", "b", 2, defense)
    },
    units: {
      attacker: {
        id: "attacker", definitionId: "attacker", ownerId: "alpha", territoryId: "t1",
        currentHealth: 3, currentShoot: shoot, currentMelee: 2, currentDefense: 2, currentObjectiveControl: 1,
        activation: "ready", effectIds: []
      },
      target: {
        id: "target", definitionId: "target", ownerId: "beta", territoryId: targetTerritory,
        currentHealth: 3, currentShoot: 2, currentMelee: 2, currentDefense: defense, currentObjectiveControl: 1,
        activation: "ready", effectIds: []
      }
    },
    territories: {
      t1: { id: "t1", name: "T1", territoryClass: "OBJECTIVE", occupantUnitIds: ["attacker"], control: { kind: "uncontrolled", controlledBy: null }, activation: null, effectIds: [] },
      t2: { id: "t2", name: "T2", territoryClass: "OBJECTIVE", occupantUnitIds: targetTerritory === "t2" ? ["target"] : [], control: { kind: "uncontrolled", controlledBy: null }, activation: null, effectIds: [] },
      t3: { id: "t3", name: "T3", territoryClass: "OBJECTIVE", occupantUnitIds: targetTerritory === "t3" ? ["target"] : [], control: { kind: "uncontrolled", controlledBy: null }, activation: null, effectIds: [] }
    },
    battlefieldTerritoryIds: ["t1", "t2", "t3"]
  });
  return enterActionPhase(beginRound(initial, "alpha").nextState).nextState;
}

test("Shoot uses SHOOT - DISTANCE and attacker does not roll", () => {
  const assessment = assessShoot(buildState(), "alpha", "attacker", "target", noModifiers());
  assert.deepEqual(assessment, { status: "allowed", distance: 2, baseAttackValue: 1, modifierTotal: 0, attackModifiers: [], attackValue: 1 });
});

test("ATTACK=0 fails closed as unresolved RG-003A", () => {
  const assessment = assessShoot(buildState({ shoot: 2 }), "alpha", "attacker", "target", noModifiers());
  assert.equal(assessment.status, "unresolved");
  assert.equal(assessment.errors[0]?.code, "RG-003A_ATTACK_ZERO");
});

test("negative final ATTACK with no modifiers is not exposed as legal", () => {
  const state = buildState({ shoot: 1 });
  assert.equal(assessShoot(state, "alpha", "attacker", "target", noModifiers()).status, "blocked");
  assert.equal(getLegalShootActions(state, "alpha", noModifiers).length, 0);
});

test("positive Attack modifiers can make an otherwise out-of-range Shoot legal", () => {
  const state = buildState({ shoot: 1 });
  const assessment = assessShoot(state, "alpha", "attacker", "target", {
    attackModifiers: [{ id: "high-ground", amount: 2, source: "environment", label: "High Ground" }]
  });
  assert.equal(assessment.status, "allowed");
  assert.equal(assessment.baseAttackValue, -1);
  assert.equal(assessment.modifierTotal, 2);
  assert.equal(assessment.attackValue, 1);
});

test("negative Attack modifiers are applied before final Shoot legality", () => {
  const state = buildState({ shoot: 3 });
  const assessment = assessShoot(state, "alpha", "attacker", "target", {
    attackModifiers: [{ id: "smoke", amount: -1, source: "token", label: "Smoke" }]
  });
  assert.equal(assessment.status, "unresolved");
  assert.equal(assessment.errors[0]?.code, "RG-003A_ATTACK_ZERO");
});

test("legal Shoot actions expose enemy targets only when ATTACK is positive", () => {
  const actions = getLegalShootActions(buildState(), "alpha", noModifiers);
  assert.deepEqual(actions.map((action) => action.payload.targetUnitId), ["target"]);
});

test("Defense roll uses effective DEFENSE and sourced Fate Dice", () => {
  const state = buildState({ targetTerritory: "t2", shoot: 4, defense: 1 });
  const assessment = assessShoot(state, "alpha", "attacker", "target", noModifiers());
  assert.equal(assessment.status, "allowed");
  const resolution = resolveShootDefense(state, assessment, "target", new SeededRng(1));
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.attackValue, 3);
  assert.equal(resolution.defenseRoll.dice.length, 1);
  assert.ok(resolution.damage >= 1);
});

test("Defense greater than Attack still resolves and floors damage at 0", () => {
  const state = buildState({ targetTerritory: "t2", shoot: 2, defense: 6 });
  const assessment = assessShoot(state, "alpha", "attacker", "target", noModifiers());
  assert.equal(assessment.status, "allowed");
  let floored = null;
  for (let seed = 1; seed < 100 && floored === null; seed += 1) {
    const result = resolveShootDefense(state, assessment, "target", new SeededRng(seed));
    if (result.status === "resolved" && result.defenseRoll.total > result.attackValue) floored = result;
  }
  assert.ok(floored);
  assert.equal(floored.damage, 0);
});


test("Spikemites are never exposed as legal Shoot targets", () => {
  const state = buildState({ targetTerritory: "t2", shoot: 4 });
  const restricted = {
    ...state,
    units: {
      ...state.units,
      target: { ...state.units.target, definitionId: "fatebound-spikemites" }
    },
    unitDefinitions: {
      ...state.unitDefinitions,
      "fatebound-spikemites": definition("fatebound-spikemites", "b", 2, 1)
    }
  };
  const assessment = assessShoot(restricted, "alpha", "attacker", "target", noModifiers());
  assert.equal(assessment.status, "blocked");
  assert.equal(assessment.errors[0]?.code, "SHOOT_TARGET_IMMUNE");
  assert.equal(getLegalShootActions(restricted, "alpha", noModifiers).length, 0);
});

test("The Hallowed can be shot only from same or adjacent Territory", () => {
  const far = buildState({ targetTerritory: "t3", shoot: 5 });
  const farRestricted = {
    ...far,
    units: {
      ...far.units,
      target: { ...far.units.target, definitionId: "fatebound-the-hallowed" }
    },
    unitDefinitions: {
      ...far.unitDefinitions,
      "fatebound-the-hallowed": definition("fatebound-the-hallowed", "b", null, 5)
    }
  };
  const farAssessment = assessShoot(farRestricted, "alpha", "attacker", "target", noModifiers());
  assert.equal(farAssessment.status, "blocked");
  assert.equal(farAssessment.errors[0]?.code, "SHOOT_TARGET_RANGE_RESTRICTED");

  const adjacent = buildState({ targetTerritory: "t2", shoot: 5 });
  const adjacentRestricted = {
    ...adjacent,
    units: {
      ...adjacent.units,
      target: { ...adjacent.units.target, definitionId: "fatebound-the-hallowed" }
    },
    unitDefinitions: {
      ...adjacent.unitDefinitions,
      "fatebound-the-hallowed": definition("fatebound-the-hallowed", "b", null, 5)
    }
  };
  assert.equal(
    assessShoot(adjacentRestricted, "alpha", "attacker", "target", noModifiers()).status,
    "allowed"
  );
});


test("Shoot applies nonlethal wounds, recalculates stats, deactivates attacker, and hands priority", () => {
  const state = buildState({ targetTerritory: "t2", shoot: 3, defense: 1 });
  const [action] = getLegalShootActions(state, "alpha", noModifiers);
  const zeroDefenseRng = { nextFloat: () => 0, nextInt: () => 0, pick: (items) => items[0] };
  const result = applyShoot(state, action, noModifiers, zeroDefenseRng);
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.target.wounds, 2);
  assert.equal(result.nextState.units.target.currentHealth, 1);
  assert.equal(result.nextState.units.target.currentDefense, 1, "wounded non-null stats floor at 1");
  assert.equal(result.nextState.units.attacker.activation, "used");
  assert.equal(result.nextState.roundFlow.priorityPlayerId, "beta");
  assert.equal(result.events[0]?.type, "unit.shot");
  assert.equal(result.events[0]?.payload.damage, 2);
});

test("Shoot still consumes the action when Defense blocks all damage", () => {
  const state = buildState({ targetTerritory: "t2", shoot: 2, defense: 1 });
  const [action] = getLegalShootActions(state, "alpha", noModifiers);
  const maxFaceRng = { nextFloat: () => 0.99, nextInt: () => 5, pick: (items) => items[items.length - 1] };
  const result = applyShoot(state, action, noModifiers, maxFaceRng);
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.target.wounds, 0);
  assert.equal(result.nextState.units.attacker.activation, "used");
  assert.equal(result.events[0]?.payload.damage, 0);
});

test("potentially lethal Shoot fails closed before RNG when kill VP or On-Death is unresolved", () => {
  const state = buildState({ targetTerritory: "t2", shoot: 4, defense: 1 });
  const [action] = getLegalShootActions(state, "alpha", noModifiers);
  let rolls = 0;
  const rng = { nextFloat: () => 0, nextInt: () => { rolls += 1; return 0; }, pick: (items) => items[0] };
  const result = applyShoot(state, action, noModifiers, rng);
  assert.equal(result.accepted, false);
  assert.equal(result.error?.code, "POTENTIAL_LETHAL_BRANCH_UNRESOLVED");
  assert.equal(rolls, 0, "fail-closed lethal gate must not consume RNG");
  assert.equal(result.nextState, state);
});

test("explicit base destruction data allows lethal Shoot to move a Troop to Reserves and award VP", () => {
  const base = buildState({ targetTerritory: "t2", shoot: 4, defense: 1 });
  const state = {
    ...base,
    unitDefinitions: {
      ...base.unitDefinitions,
      target: { ...base.unitDefinitions.target, destroyedVictoryPoints: 1 }
    }
  };
  const [action] = getLegalShootActions(state, "alpha", noModifiers);
  const zeroDefenseRng = { nextFloat: () => 0, nextInt: () => 0, pick: (items) => items[0] };
  const result = applyShoot(state, action, noModifiers, zeroDefenseRng);
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.target.territoryId, null);
  assert.equal(result.nextState.units.target.offFieldZone, "reserves");
  assert.equal(result.nextState.territories.t2.occupantUnitIds.includes("target"), false);
  assert.equal(result.nextState.players.alpha.victoryPoints, 1);
  assert.equal(result.events[0]?.payload.destroyed, true);
});


test("simple Gain CP On-Death resolves automatically with Command cap", () => {
  const base = buildState({ targetTerritory: "t2", shoot: 4, defense: 1 });
  const state = {
    ...base,
    players: {
      ...base.players,
      beta: { ...base.players.beta, command: 2 }
    },
    unitDefinitions: {
      ...base.unitDefinitions,
      target: { ...base.unitDefinitions.target, unitClass: "Leader", destroyedVictoryPoints: 3, onDeathText: "Gain 2 CP" }
    }
  };
  const [action] = getLegalShootActions(state, "alpha", noModifiers);
  const zeroDefenseRng = { nextFloat: () => 0, nextInt: () => 0, pick: (items) => items[0] };
  const result = applyShoot(state, action, noModifiers, zeroDefenseRng);
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.players.alpha.victoryPoints, 3);
  assert.equal(result.nextState.players.beta.command, 3, "On-Death Command gain respects cap 3");
  assert.equal(result.events.some((event) => event.type === "unit.on-death.command-gained"), true);
});

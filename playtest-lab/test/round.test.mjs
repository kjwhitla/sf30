import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "../dist/engine/state.js";
import { beginRound, enterActionPhase, enterEndRoundPhase, updateTokens } from "../dist/rules/round.js";

function state() {
  return createInitialGameState({
    gameId: "round-test",
    seed: 30,
    players: {
      alpha: { id: "alpha", factionId: "a", command: 2, victoryPoints: 0, unitIds: ["u1", "u2"] },
      beta: { id: "beta", factionId: "b", command: 3, victoryPoints: 0, unitIds: [] }
    },
    unitDefinitions: {
      d1: {
        id: "d1", name: "Fixture", factionId: "a", unitClass: "TROOP", stars: null, flags: null,
        stats: { health: 1, shoot: 1, melee: 1, defense: 1, objectiveControl: 1, movement: 1 },
        abilityText: null, onDeathText: null,
        sources: [{ id: "fixture", kind: "test-fixture", title: "Fixture", version: "1" }]
      }
    },
    units: {
      u1: {
        id: "u1", definitionId: "d1", ownerId: "alpha", territoryId: null,
        currentHealth: 1, currentShoot: 1, currentMelee: 1, currentDefense: 1, currentObjectiveControl: 1, activation: "used", effectIds: []
      },
      u2: {
        id: "u2", definitionId: "d1", ownerId: "alpha", territoryId: "t1",
        currentHealth: 1, currentShoot: 1, currentMelee: 1, currentDefense: 1, currentObjectiveControl: 1, activation: "used", effectIds: []
      }
    },
    territories: {
      t1: {
        id: "t1", name: "T1", territoryClass: "OBJECTIVE", occupantUnitIds: ["u2"],
        control: { kind: "uncontrolled", controlledBy: null }, activation: null, effectIds: []
      }
    },
    battlefieldTerritoryIds: ["t1"]
  });
}

test("beginRound applies confirmed round-start effects after first player is selected", () => {
  const result = beginRound(state(), "beta");
  assert.equal(result.nextState.lifecycle, "active");
  assert.deepEqual(result.nextState.roundFlow, {
    round: 1,
    phase: "command",
    firstPlayerId: "beta",
    priorityPlayerId: "beta"
  });
  assert.equal(result.nextState.players.alpha.command, 3);
  assert.equal(result.nextState.players.beta.command, 3);
  assert.equal(result.nextState.units.u1.activation, "used", "off-field units are not reactivated");
  assert.equal(result.nextState.units.u2.activation, "ready", "battlefield units are reactivated");
  assert.equal(result.events[0]?.type, "round.started");
});

test("phase transitions preserve first player and set action priority", () => {
  const command = beginRound(state(), "alpha").nextState;
  const action = enterActionPhase(command).nextState;
  assert.equal(action.roundFlow?.phase, "action");
  assert.equal(action.roundFlow?.priorityPlayerId, "alpha");

  const end = enterEndRoundPhase(action).nextState;
  assert.equal(end.roundFlow?.phase, "end-round");
  assert.equal(end.roundFlow?.priorityPlayerId, null);
});

test("beginRound preserves temporary effects until the sourced Update Tokens step", () => {
  const base = state();
  const modified = {
    ...base,
    unitDefinitions: {
      ...base.unitDefinitions,
      d1: {
        ...base.unitDefinitions.d1,
        stats: { health: 3, shoot: 3, melee: 3, defense: 3, objectiveControl: 2, movement: 1 }
      }
    },
    units: {
      ...base.units,
      u2: {
        ...base.units.u2,
        wounds: 1,
        temporaryStatModifiers: [
          { id: "dig-in-old", stat: "defense", amount: 2, source: "action", label: "Dig In" }
        ],
        currentHealth: 2,
        currentShoot: 2,
        currentMelee: 2,
        currentDefense: 4,
        currentObjectiveControl: 2,
        currentMovement: 1
      }
    }
  };

  const round = beginRound(modified, "alpha").nextState;
  assert.equal(round.units.u2.wounds, 1, "persistent wounds survive the round boundary");
  assert.equal(round.units.u2.currentDefense, 4, "Dig In persists into Command until Update Tokens");
  assert.deepEqual(round.units.u2.temporaryStatModifiers, [
    { id: "dig-in-old", stat: "defense", amount: 2, source: "action", label: "Dig In" }
  ]);
  assert.equal(round.units.u2.activation, "ready");

  const updated = updateTokens(round, ({ unitId }) =>
    unitId === "u2"
      ? [{ id: "cover", stat: "defense", amount: 1, source: "environment", label: "Current cover" }]
      : []
  ).nextState;
  const unit = updated.units.u2;
  assert.equal(unit.wounds, 1);
  assert.deepEqual(unit.temporaryStatModifiers, [
    { id: "cover", stat: "defense", amount: 1, source: "environment", label: "Current cover" }
  ], "Update Tokens removes prior Dig In and rebuilds current context");
  assert.equal(unit.currentHealth, 2);
  assert.equal(unit.currentShoot, 2, "printed SHOOT 3 minus one wound");
  assert.equal(unit.currentMelee, 2, "printed MELEE 3 minus one wound");
  assert.equal(unit.currentDefense, 3, "printed DEF 3 minus wound plus current cover");
  assert.equal(unit.currentObjectiveControl, 2, "wounds do not reduce OC");
});

test("Update Tokens is command-phase-only and emits a deterministic event", () => {
  const command = beginRound(state(), "alpha").nextState;
  const result = updateTokens(command);
  assert.equal(result.events[0]?.type, "command.tokens.updated");
  assert.equal(result.nextState.eventSequence, command.eventSequence + 1);
  const action = enterActionPhase(result.nextState).nextState;
  assert.throws(() => updateTokens(action), /Command Phase/);
});

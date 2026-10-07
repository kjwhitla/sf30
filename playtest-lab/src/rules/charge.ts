import type { EngineAction, ResolutionResult, RuleError } from "../engine/actions.js";
import type { GameEvent } from "../engine/events.js";
import { assertStateInvariants } from "../engine/invariants.js";
import type { GameState, PlayerId, UnitId } from "../engine/types.js";
import type { RandomSource } from "../engine/rng.js";
import { rollFateDice, type FateRoll } from "./dice.js";
import { resolvePostActionPriority } from "./action-phase.js";
import { recalculateStandardTerritoryControl } from "./objective-control.js";

export type ChargeAction = EngineAction<
  "unit.charge",
  {
    readonly attackerUnitId: UnitId;
    readonly targetUnitId: UnitId;
  }
>;

export type ChargeAssessment =
  | { readonly status: "allowed"; readonly distance: 1 | 2 }
  | { readonly status: "blocked"; readonly errors: readonly RuleError[] };

export interface ChargeRollResolution {
  readonly distance: 1 | 2;
  readonly roll: FateRoll;
  readonly rollAttempts: readonly FateRoll[];
  readonly success: boolean;
}

const PLAYER_ZONE_UNIT_LIMIT = 3;

/**
 * Return production-safe Charge actions sourced from the Live Working Version:
 * target an enemy 1-2 Territories away, move to its Territory, roll 1 Fate Die,
 * and engage in Melee on a result >= distance traveled.
 *
 * This function only exposes legal targets. It does not mutate board state.
 */
export function getLegalChargeActions(state: GameState, playerId: PlayerId): readonly ChargeAction[] {
  const player = state.players[playerId];
  if (!player || state.lifecycle !== "active" || state.roundFlow?.phase !== "action") {
    return [];
  }
  if (state.roundFlow.priorityPlayerId !== null && state.roundFlow.priorityPlayerId !== playerId) {
    return [];
  }

  const actions: ChargeAction[] = [];
  for (const attackerUnitId of player.unitIds) {
    for (const target of Object.values(state.units)) {
      if (target.ownerId === playerId) continue;
      const assessment = assessCharge(state, playerId, attackerUnitId, target.id);
      if (assessment.status !== "allowed") continue;
      actions.push({
        id: `unit.charge:${attackerUnitId}:${target.id}:${state.eventSequence}`,
        type: "unit.charge",
        playerId,
        basedOnEventSequence: state.eventSequence,
        payload: { attackerUnitId, targetUnitId: target.id }
      });
    }
  }
  return actions;
}

export function assessCharge(
  state: GameState,
  playerId: PlayerId,
  attackerUnitId: UnitId,
  targetUnitId: UnitId
): ChargeAssessment {
  const errors: RuleError[] = [];
  const player = state.players[playerId];
  const attacker = state.units[attackerUnitId];
  const target = state.units[targetUnitId];

  if (!player) errors.push(ruleError("PLAYER_MISSING", `Player ${playerId} does not exist.`));
  if (!attacker) errors.push(ruleError("ATTACKER_MISSING", `Unit ${attackerUnitId} does not exist.`));
  if (!target) errors.push(ruleError("TARGET_MISSING", `Unit ${targetUnitId} does not exist.`));
  if (errors.length > 0 || !player || !attacker || !target) return { status: "blocked", errors };

  const flow = state.roundFlow;
  if (state.pendingMelee !== null) {
    errors.push(ruleError("MELEE_SEQUENCE_PENDING", "Another action cannot begin while a Melee sequence is awaiting resolution."));
  }
  if (state.lifecycle !== "active" || flow?.phase !== "action") {
    errors.push(ruleError("NOT_ACTION_PHASE", "Charge is only legal during the Action Phase."));
  } else if (flow.priorityPlayerId !== null && flow.priorityPlayerId !== playerId) {
    errors.push(ruleError("NO_PRIORITY", `Player ${playerId} does not currently have activation priority.`));
  }
  if (attacker.ownerId !== playerId) {
    errors.push(ruleError("NOT_UNIT_OWNER", `Player ${playerId} does not own unit ${attackerUnitId}.`));
  }
  if (target.ownerId === playerId) {
    errors.push(ruleError("FRIENDLY_TARGET", "Charge must target an enemy unit."));
  }
  if (attacker.activation !== "ready") {
    errors.push(ruleError("UNIT_DEACTIVATED", `Unit ${attackerUnitId} is not ready to act.`));
  }
  if (attacker.territoryId === null) {
    errors.push(ruleError("ATTACKER_OFF_FIELD", `Unit ${attackerUnitId} is not on the battlefield.`));
  }
  if (target.territoryId === null) {
    errors.push(ruleError("TARGET_OFF_FIELD", `Unit ${targetUnitId} is not on the battlefield.`));
  }
  if (attacker.currentMelee === null) {
    errors.push(ruleError("MELEE_STAT_NULL", `Unit ${attackerUnitId} does not operate with a MELEE stat and cannot resolve a successful Charge into Melee.`));
  }
  if (errors.length > 0 || attacker.territoryId === null || target.territoryId === null) {
    return { status: "blocked", errors };
  }

  const fromIndex = state.battlefieldTerritoryIds.indexOf(attacker.territoryId);
  const toIndex = state.battlefieldTerritoryIds.indexOf(target.territoryId);
  if (fromIndex < 0 || toIndex < 0) {
    return {
      status: "blocked",
      errors: [ruleError("BATTLEFIELD_ORDER_MISSING", "Charge endpoints must exist in battlefield order.")]
    };
  }

  const distance = Math.abs(toIndex - fromIndex);
  if (distance < 1 || distance > 2) {
    return {
      status: "blocked",
      errors: [ruleError("CHARGE_TARGET_OUT_OF_RANGE", "Charge must target an enemy unit 1 or 2 Territories away.")]
    };
  }

  const destination = state.territories[target.territoryId];
  if (!destination) {
    return {
      status: "blocked",
      errors: [ruleError("DESTINATION_MISSING", `Territory ${target.territoryId} does not exist.`)]
    };
  }

  const ownUnitsAtDestination = destination.occupantUnitIds.filter(
    (occupantId) => state.units[occupantId]?.ownerId === playerId
  ).length;
  if (ownUnitsAtDestination >= PLAYER_ZONE_UNIT_LIMIT) {
    return {
      status: "blocked",
      errors: [
        ruleError(
          "PLAYER_ZONE_FULL",
          `Player ${playerId} already has ${PLAYER_ZONE_UNIT_LIMIT} units in ${target.territoryId}.`
        )
      ]
    };
  }

  return { status: "allowed", distance: distance as 1 | 2 };
}

/** Resolve the sourced Fate Die gate for a legal Charge. */
export function resolveChargeRoll(
  distance: 1 | 2,
  rng: RandomSource,
  attempts = 1
): ChargeRollResolution {
  const rollAttempts = Array.from({ length: Math.max(1, attempts) }, () => rollFateDice(1, rng));
  const roll = rollAttempts.reduce((best, candidate) =>
    candidate.total > best.total ? candidate : best
  );
  return { distance, roll, rollAttempts, success: roll.total >= distance };
}



/**
 * Resolve the sourced Charge movement + Fate Die gate.
 * On success the action enters the shared pending Melee state machine; on
 * failure the movement remains, the charger is deactivated, and priority moves
 * on normally.
 */
export function applyCharge(state: GameState, action: ChargeAction, rng: RandomSource): ResolutionResult {
  if (action.basedOnEventSequence !== state.eventSequence) {
    return rejected(state, ruleError("STALE_ACTION", `Action was based on event sequence ${action.basedOnEventSequence}; current sequence is ${state.eventSequence}.`));
  }
  const assessment = assessCharge(
    state,
    action.playerId,
    action.payload.attackerUnitId,
    action.payload.targetUnitId
  );
  if (assessment.status !== "allowed") {
    return rejected(state, assessment.errors[0] ?? ruleError("CHARGE_BLOCKED", "Charge is not legal."));
  }

  const attacker = state.units[action.payload.attackerUnitId];
  const target = state.units[action.payload.targetUnitId];
  if (!attacker || attacker.territoryId === null || !target || target.territoryId === null) {
    return rejected(state, ruleError("CHARGE_ENDPOINT_MISSING", "Charge endpoints must both be on the battlefield."));
  }
  const source = state.territories[attacker.territoryId];
  const destination = state.territories[target.territoryId];
  if (!source || !destination) return rejected(state, ruleError("CHARGE_TERRITORY_MISSING", "Charge endpoint Territory is missing."));

  const fromTerritoryId = attacker.territoryId;
  const toTerritoryId = target.territoryId;
  const units = {
    ...state.units,
    [attacker.id]: { ...attacker, territoryId: toTerritoryId, activation: "used" as const }
  };
  const territories = {
    ...state.territories,
    [fromTerritoryId]: {
      ...source,
      occupantUnitIds: source.occupantUnitIds.filter((id) => id !== attacker.id)
    },
    [toTerritoryId]: {
      ...destination,
      occupantUnitIds: [...destination.occupantUnitIds, attacker.id]
    }
  };
  const moved = recalculateStandardTerritoryControl({ ...state, units, territories });
  const attackerDefinition = state.unitDefinitions[attacker.definitionId];
  const chargeAttempts = attackerDefinition?.id === "iron-wake-chain-blades" ? 2 : 1;
  const charge = resolveChargeRoll(assessment.distance, rng, chargeAttempts);
  const chargeSequence = state.eventSequence + 1;
  const events: GameEvent[] = [{
    gameId: state.gameId,
    sequence: chargeSequence,
    type: "unit.charged",
    actorId: action.playerId,
    payload: {
      attackerUnitId: attacker.id,
      targetUnitId: target.id,
      fromTerritoryId,
      toTerritoryId,
      distance: assessment.distance,
      rollDice: charge.roll.dice,
      rollTotal: charge.roll.total,
      rollAttempts: charge.rollAttempts.map((attempt) => attempt.dice),
      success: charge.success
    }
  }];

  if (charge.success) {
    const nextState: GameState = {
      ...moved,
      pendingMelee: {
        initiatorUnitId: attacker.id,
        defenderUnitId: target.id,
        actingPlayerId: action.playerId,
        exchange: 1,
        phase: "initiator-strike",
        sourceAction: "charge"
      },
      eventSequence: chargeSequence
    };
    assertStateInvariants(nextState);
    return { accepted: true, nextState, events };
  }

  const priorityResolution = resolvePostActionPriority(moved, action.playerId);
  if (priorityResolution.actionPhaseEnded) {
    events.push({
      gameId: state.gameId,
      sequence: chargeSequence + 1,
      type: "phase.end-round.started",
      actorId: null,
      payload: { round: priorityResolution.roundFlow.round }
    });
  }
  const finalSequence = events[events.length - 1]?.sequence ?? chargeSequence;
  const nextState: GameState = {
    ...moved,
    roundFlow: priorityResolution.roundFlow,
    scenario: priorityResolution.actionPhaseEnded && state.scenario
      ? { ...state.scenario, round: priorityResolution.roundFlow.round, phase: "end-round" }
      : state.scenario,
    eventSequence: finalSequence
  };
  assertStateInvariants(nextState);
  return { accepted: true, nextState, events };
}

function rejected(state: GameState, error: RuleError): ResolutionResult {
  return { accepted: false, nextState: state, events: [], error };
}

function ruleError(code: string, message: string): RuleError {
  return { code, message };
}

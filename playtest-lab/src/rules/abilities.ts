import type { EngineAction, ResolutionResult, RuleError } from "../engine/actions.js";
import type { GameEvent } from "../engine/events.js";
import { assertStateInvariants } from "../engine/invariants.js";
import type { GameState, PlayerId, UnitId } from "../engine/types.js";
import { resolvePostActionPriority } from "./action-phase.js";
import { recalculateStandardTerritoryControl } from "./objective-control.js";
import { recalculateUnitState } from "./stats.js";

export type UnitAbilityAction = EngineAction<
  "unit.ability",
  {
    readonly unitId: UnitId;
    readonly abilityId: "field-surgeon";
    readonly targetUnitId: UnitId;
  }
>;

export type UnitAbilityAssessment =
  | { readonly status: "allowed" }
  | { readonly status: "blocked"; readonly errors: readonly RuleError[] };

/**
 * Production-safe Action Abilities from the current Live Stats roster.
 *
 * This intentionally exposes only abilities whose targeting and state mutation
 * are explicit enough to execute without inventing timing, range, or choice
 * semantics. Today that is Biomedic — Field Surgeon.
 */
export function getLegalUnitAbilityActions(
  state: GameState,
  playerId: PlayerId
): readonly UnitAbilityAction[] {
  const player = state.players[playerId];
  if (!player || state.lifecycle !== "active" || state.roundFlow?.phase !== "action") return [];
  if (state.roundFlow.priorityPlayerId !== null && state.roundFlow.priorityPlayerId !== playerId) return [];

  const actions: UnitAbilityAction[] = [];
  for (const unitId of player.unitIds) {
    const unit = state.units[unitId];
    if (!unit || unit.definitionId !== "iron-wake-biomedic") continue;
    for (const targetUnitId of player.unitIds) {
      const assessment = assessUnitAbility(state, playerId, unitId, "field-surgeon", targetUnitId);
      if (assessment.status !== "allowed") continue;
      actions.push({
        id: `unit.ability:field-surgeon:${unitId}:${targetUnitId}:${state.eventSequence}`,
        type: "unit.ability",
        playerId,
        basedOnEventSequence: state.eventSequence,
        payload: { unitId, abilityId: "field-surgeon", targetUnitId }
      });
    }
  }
  return actions;
}

export function assessUnitAbility(
  state: GameState,
  playerId: PlayerId,
  unitId: UnitId,
  abilityId: "field-surgeon",
  targetUnitId: UnitId
): UnitAbilityAssessment {
  const errors: RuleError[] = [];
  const player = state.players[playerId];
  const unit = state.units[unitId];
  const target = state.units[targetUnitId];

  if (!player) errors.push(ruleError("PLAYER_MISSING", `Player ${playerId} does not exist.`));
  if (!unit) errors.push(ruleError("UNIT_MISSING", `Unit ${unitId} does not exist.`));
  if (!target) errors.push(ruleError("TARGET_MISSING", `Unit ${targetUnitId} does not exist.`));
  if (errors.length > 0 || !player || !unit || !target) return { status: "blocked", errors };

  if (abilityId !== "field-surgeon" || unit.definitionId !== "iron-wake-biomedic") {
    errors.push(ruleError("ABILITY_NOT_EXECUTABLE", `Ability ${abilityId} is not executable for unit ${unitId}.`));
  }
  const flow = state.roundFlow;
  if (state.pendingMelee !== null) {
    errors.push(ruleError("MELEE_SEQUENCE_PENDING", "Another action cannot begin while a Melee sequence is awaiting resolution."));
  }
  if (state.lifecycle !== "active" || flow?.phase !== "action") {
    errors.push(ruleError("NOT_ACTION_PHASE", "Action Abilities are only legal during the Action Phase."));
  } else if (flow.priorityPlayerId !== null && flow.priorityPlayerId !== playerId) {
    errors.push(ruleError("NO_PRIORITY", `Player ${playerId} does not currently have activation priority.`));
  }
  if (unit.ownerId !== playerId) errors.push(ruleError("NOT_UNIT_OWNER", `Player ${playerId} does not own unit ${unitId}.`));
  if (unit.activation !== "ready") errors.push(ruleError("UNIT_DEACTIVATED", `Unit ${unitId} is not ready to act.`));
  if (unit.territoryId === null) errors.push(ruleError("UNIT_OFF_FIELD", `Unit ${unitId} is not on the battlefield.`));
  if (target.ownerId !== playerId) errors.push(ruleError("ABILITY_TARGET_NOT_ALLIED", "Field Surgeon must target an allied unit."));
  if (target.territoryId === null) errors.push(ruleError("ABILITY_TARGET_OFF_FIELD", `Unit ${targetUnitId} is not on the battlefield.`));
  const targetDefinition = state.unitDefinitions[target.definitionId];
  if (!targetDefinition) {
    errors.push(ruleError("UNIT_DEFINITION_MISSING", `Missing definition ${target.definitionId}.`));
  } else if (targetDefinition.unitClass.trim().toUpperCase() === "VEHICLE") {
    errors.push(ruleError("FIELD_SURGEON_VEHICLE_TARGET", "Field Surgeon cannot target a Vehicle."));
  }
  if (target.wounds < 1) errors.push(ruleError("FIELD_SURGEON_NO_WOUND", `Unit ${targetUnitId} has no -1 token to remove.`));

  if (unit.territoryId !== null && target.territoryId !== null) {
    const fromIndex = state.battlefieldTerritoryIds.indexOf(unit.territoryId);
    const toIndex = state.battlefieldTerritoryIds.indexOf(target.territoryId);
    if (fromIndex < 0 || toIndex < 0) {
      errors.push(ruleError("BATTLEFIELD_ORDER_MISSING", "Field Surgeon endpoints must exist in battlefield order."));
    } else if (Math.abs(toIndex - fromIndex) > 1) {
      errors.push(ruleError("FIELD_SURGEON_OUT_OF_RANGE", "Field Surgeon targets a non-Vehicle allied unit in the same or an adjacent Territory."));
    }
  }

  return errors.length > 0 ? { status: "blocked", errors } : { status: "allowed" };
}

export function applyUnitAbility(state: GameState, action: UnitAbilityAction): ResolutionResult {
  if (action.basedOnEventSequence !== state.eventSequence) {
    return rejected(state, ruleError("STALE_ACTION", `Action was based on event sequence ${action.basedOnEventSequence}; current sequence is ${state.eventSequence}.`));
  }
  const assessment = assessUnitAbility(
    state,
    action.playerId,
    action.payload.unitId,
    action.payload.abilityId,
    action.payload.targetUnitId
  );
  if (assessment.status !== "allowed") {
    return rejected(state, assessment.errors[0] ?? ruleError("ABILITY_BLOCKED", "Action Ability is not legal."));
  }

  const actor = state.units[action.payload.unitId];
  const target = state.units[action.payload.targetUnitId];
  if (!actor || !target) return rejected(state, ruleError("ABILITY_ENDPOINT_MISSING", "Ability actor or target is missing."));
  const targetDefinition = state.unitDefinitions[target.definitionId];
  if (!targetDefinition) return rejected(state, ruleError("UNIT_DEFINITION_MISSING", `Missing definition ${target.definitionId}.`));

  const healed = recalculateUnitState(
    targetDefinition,
    { ...target, wounds: Math.max(0, target.wounds - 1) },
    target.temporaryStatModifiers
  );
  const units = {
    ...state.units,
    [target.id]: healed,
    [actor.id]: actor.id === target.id
      ? { ...healed, activation: "used" as const }
      : { ...actor, activation: "used" as const }
  };
  const controlState = recalculateStandardTerritoryControl({ ...state, units });
  const priorityResolution = resolvePostActionPriority(controlState, action.playerId);

  const sequence = state.eventSequence + 1;
  const events: GameEvent[] = [{
    gameId: state.gameId,
    sequence,
    type: "unit.ability.resolved",
    actorId: action.playerId,
    payload: {
      unitId: actor.id,
      abilityId: "field-surgeon",
      targetUnitId: target.id,
      woundsRemoved: 1
    }
  }];
  if (priorityResolution.actionPhaseEnded) {
    events.push({
      gameId: state.gameId,
      sequence: sequence + 1,
      type: "phase.end-round.started",
      actorId: null,
      payload: { round: priorityResolution.roundFlow.round }
    });
  }

  const finalSequence = events[events.length - 1]?.sequence ?? sequence;
  const nextState: GameState = {
    ...controlState,
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

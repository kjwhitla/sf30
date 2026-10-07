import type { EngineAction, ResolutionResult, RuleError } from "../engine/actions.js";
import type { GameEvent } from "../engine/events.js";
import { assertStateInvariants } from "../engine/invariants.js";
import type { GameState, PlayerId, UnitId, UnitStatModifier } from "../engine/types.js";
import { resolvePostActionPriority } from "./action-phase.js";
import { recalculateUnitState } from "./stats.js";

export type DigInAction = EngineAction<
  "unit.dig-in",
  {
    readonly unitId: UnitId;
  }
>;

export type DigInAssessment =
  | { readonly status: "allowed" }
  | { readonly status: "blocked"; readonly errors: readonly RuleError[] };

export const DIG_IN_DEFENSE_BONUS = 2;

/**
 * Return legal base Dig In actions from the Live Working Version.
 *
 * Core sourced effect: the acting unit gains +2 DEF until the next Update
 * Tokens step. Territory/scenario-specific Dig In enhancements remain separate
 * prototype-level mechanics.
 */
export function getLegalDigInActions(state: GameState, playerId: PlayerId): readonly DigInAction[] {
  const player = state.players[playerId];
  if (!player || state.lifecycle !== "active" || state.roundFlow?.phase !== "action") {
    return [];
  }
  if (state.roundFlow.priorityPlayerId !== null && state.roundFlow.priorityPlayerId !== playerId) {
    return [];
  }

  const actions: DigInAction[] = [];
  for (const unitId of player.unitIds) {
    const assessment = assessDigIn(state, playerId, unitId);
    if (assessment.status !== "allowed") continue;
    actions.push({
      id: `unit.dig-in:${unitId}:${state.eventSequence}`,
      type: "unit.dig-in",
      playerId,
      basedOnEventSequence: state.eventSequence,
      payload: { unitId }
    });
  }
  return actions;
}

export function assessDigIn(
  state: GameState,
  playerId: PlayerId,
  unitId: UnitId
): DigInAssessment {
  const errors: RuleError[] = [];
  const player = state.players[playerId];
  const unit = state.units[unitId];

  if (!player) errors.push(ruleError("PLAYER_MISSING", `Player ${playerId} does not exist.`));
  if (!unit) errors.push(ruleError("UNIT_MISSING", `Unit ${unitId} does not exist.`));
  if (errors.length > 0 || !player || !unit) return { status: "blocked", errors };

  const flow = state.roundFlow;
  if (state.pendingMelee !== null) {
    errors.push(ruleError("MELEE_SEQUENCE_PENDING", "Another action cannot begin while a Melee sequence is awaiting resolution."));
  }
  if (state.lifecycle !== "active" || flow?.phase !== "action") {
    errors.push(ruleError("NOT_ACTION_PHASE", "Dig In is only legal during the Action Phase."));
  } else if (flow.priorityPlayerId !== null && flow.priorityPlayerId !== playerId) {
    errors.push(ruleError("NO_PRIORITY", `Player ${playerId} does not currently have activation priority.`));
  }
  if (unit.ownerId !== playerId) {
    errors.push(ruleError("NOT_UNIT_OWNER", `Player ${playerId} does not own unit ${unitId}.`));
  }
  if (unit.activation !== "ready") {
    errors.push(ruleError("UNIT_DEACTIVATED", `Unit ${unitId} is not ready to act.`));
  }
  if (unit.territoryId === null) {
    errors.push(ruleError("UNIT_OFF_FIELD", `Unit ${unitId} is not on the battlefield.`));
  }

  return errors.length > 0 ? { status: "blocked", errors } : { status: "allowed" };
}

/**
 * Resolve the sourced base Dig In action.
 *
 * - add +2 DEF as a temporary action modifier,
 * - recalculate the acting unit immediately,
 * - deactivate the acting unit,
 * - alternate Action Phase priority to the opposing player,
 * - emit one deterministic event.
 *
 * The modifier is removed by the next Command Phase Update Tokens transition.
 * This function does not encode any Fortification/Territory-specific Dig In
 * enhancement.
 */
export function applyDigIn(state: GameState, action: DigInAction): ResolutionResult {
  if (action.basedOnEventSequence !== state.eventSequence) {
    return rejected(
      state,
      ruleError(
        "STALE_ACTION",
        `Action was based on event sequence ${action.basedOnEventSequence}; current sequence is ${state.eventSequence}.`
      )
    );
  }

  const assessment = assessDigIn(state, action.playerId, action.payload.unitId);
  if (assessment.status === "blocked") {
    return rejected(state, assessment.errors[0] ?? ruleError("DIG_IN_BLOCKED", "Dig In is not legal."));
  }

  const unit = state.units[action.payload.unitId];
  if (!unit) {
    return rejected(state, ruleError("UNIT_MISSING", `Unit ${action.payload.unitId} does not exist.`));
  }
  const definition = state.unitDefinitions[unit.definitionId];
  if (!definition) {
    return rejected(state, ruleError("UNIT_DEFINITION_MISSING", `Missing definition ${unit.definitionId}.`));
  }

  const modifier: UnitStatModifier = {
    id: `dig-in:${unit.id}:${state.eventSequence + 1}`,
    stat: "defense",
    amount: DIG_IN_DEFENSE_BONUS,
    source: "action",
    label: "Dig In"
  };
  const recalculated = recalculateUnitState(definition, unit, [
    ...unit.temporaryStatModifiers,
    modifier
  ]);
  const units = {
    ...state.units,
    [unit.id]: { ...recalculated, activation: "used" as const }
  };
  const postActionState: GameState = { ...state, units };
  const priorityResolution = resolvePostActionPriority(postActionState, action.playerId);

  const digInSequence = state.eventSequence + 1;
  const events: GameEvent[] = [
    {
      gameId: state.gameId,
      sequence: digInSequence,
      type: "unit.dug-in",
      actorId: action.playerId,
      payload: {
        unitId: unit.id,
        defenseBonus: DIG_IN_DEFENSE_BONUS,
        expiresAt: "next-update-tokens"
      }
    } satisfies GameEvent<
      "unit.dug-in",
      {
        readonly unitId: UnitId;
        readonly defenseBonus: number;
        readonly expiresAt: "next-update-tokens";
      }
    >
  ];

  if (priorityResolution.actionPhaseEnded) {
    events.push({
      gameId: state.gameId,
      sequence: digInSequence + 1,
      type: "phase.end-round.started",
      actorId: null,
      payload: { round: priorityResolution.roundFlow.round }
    });
  }

  const finalSequence = events[events.length - 1]?.sequence ?? digInSequence;
  const nextState: GameState = {
    ...state,
    units,
    roundFlow: priorityResolution.roundFlow,
    scenario: priorityResolution.actionPhaseEnded && state.scenario
      ? {
          ...state.scenario,
          round: priorityResolution.roundFlow.round,
          phase: "end-round"
        }
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

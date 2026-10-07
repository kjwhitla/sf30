import type { GameEvent } from "../engine/events.js";
import type { GameState, PlayerId, RoundFlowState, StrikeforcePhase } from "../engine/types.js";
import { assertStateInvariants } from "../engine/invariants.js";
import { NO_UNIT_MODIFIERS, recalculateUnitState, type UnitModifierResolver } from "./stats.js";

const CMD_CAP = 3;

export interface RuleTransition {
  readonly nextState: GameState;
  readonly events: readonly GameEvent[];
}

/**
 * Begins a canonical Strikeforce round once the first player has already been
 * selected. Selection remains an input because owner-approved first-player
 * rules include Round-1 OC ordering and later-round player choice/Command,
 * which belong in a dedicated selection step rather than round initialization.
 *
 * Confirmed round-start effects encoded here:
 * - enter Command Phase,
 * - preserve temporary modifiers until the sourced Update Tokens step,
 * - preserve wounds/current effective stats until Update Tokens recalculation,
 * - clear unit deactivation,
 * - each player gains +1 Command, capped at 3.
 *
 * Deployment and +1-token purchasing remain separate Command Phase work.
 */
export function beginRound(
  state: GameState,
  firstPlayerId: PlayerId
): RuleTransition {
  assertKnownPlayer(state, firstPlayerId);
  if (state.pendingMelee !== null) {
    throw new Error("Cannot begin a round while a Melee sequence is pending.");
  }
  if (state.lifecycle === "complete") {
    throw new Error("Cannot begin a round after the game is complete.");
  }
  if (state.roundFlow?.phase === "command" || state.roundFlow?.phase === "action") {
    throw new Error(`Cannot begin a new round during ${state.roundFlow.phase} phase.`);
  }

  const round = (state.roundFlow?.round ?? 0) + 1;
  const flow: RoundFlowState = {
    round,
    phase: "command",
    firstPlayerId,
    priorityPlayerId: firstPlayerId
  };

  const players = Object.fromEntries(
    Object.entries(state.players).map(([playerId, player]) => [
      playerId,
      {
        ...player,
        command: Math.min(CMD_CAP, player.command + 1)
      }
    ])
  );

  // The Live Working Version places temporary-token cleanup in Command Step 5
  // (Update Tokens), after deployment. Preserve the prior Action Phase's
  // temporary effects until that explicit transition rather than clearing them
  // early at round initialization.
  const units = Object.fromEntries(
    Object.entries(state.units).map(([unitId, unit]) => [
      unitId,
      unit.territoryId !== null ? { ...unit, activation: "ready" as const } : unit
    ])
  );

  const sequence = state.eventSequence + 1;
  const event: GameEvent<
    "round.started",
    { readonly round: number; readonly firstPlayerId: PlayerId }
  > = {
    gameId: state.gameId,
    sequence,
    type: "round.started",
    actorId: null,
    payload: { round, firstPlayerId }
  };

  const nextState: GameState = {
    ...state,
    lifecycle: "active",
    players,
    units,
    roundFlow: flow,
    scenario: state.scenario
      ? { ...state.scenario, round, phase: "command" }
      : state.scenario,
    eventSequence: sequence
  };

  assertStateInvariants(nextState);
  return { nextState, events: [event] };
}


/**
 * Resolve Command Phase Step 5 — Update Tokens.
 *
 * The source places this after Deployment and before the Action Phase. Prior
 * temporary +1/action modifiers (including Dig In) expire here, then currently
 * valid contextual/ability modifiers are rebuilt through the injected resolver.
 * Wounds persist. Purchasing new +1 Tokens remains a separate future action.
 */
export function updateTokens(
  state: GameState,
  resolveModifiers: UnitModifierResolver = NO_UNIT_MODIFIERS
): RuleTransition {
  const flow = state.roundFlow;
  if (!flow || flow.phase !== "command") {
    throw new Error("Update Tokens is only legal during the Command Phase.");
  }

  const units = Object.fromEntries(
    Object.entries(state.units).map(([unitId, unit]) => {
      const definition = state.unitDefinitions[unit.definitionId];
      if (!definition) {
        throw new Error(`Missing definition ${unit.definitionId} for unit ${unitId}.`);
      }
      return [unitId, recalculateUnitState(definition, unit, resolveModifiers({ state, unitId }))];
    })
  );

  const sequence = state.eventSequence + 1;
  const event: GameEvent<
    "command.tokens.updated",
    { readonly round: number }
  > = {
    gameId: state.gameId,
    sequence,
    type: "command.tokens.updated",
    actorId: null,
    payload: { round: flow.round }
  };

  const nextState: GameState = {
    ...state,
    units,
    eventSequence: sequence
  };
  assertStateInvariants(nextState);
  return { nextState, events: [event] };
}

export function enterActionPhase(state: GameState): RuleTransition {
  return advancePhase(state, "command", "action", "phase.action.started");
}

export function enterEndRoundPhase(state: GameState): RuleTransition {
  return advancePhase(state, "action", "end-round", "phase.end-round.started");
}

function advancePhase(
  state: GameState,
  expected: StrikeforcePhase,
  next: StrikeforcePhase,
  eventType: "phase.action.started" | "phase.end-round.started"
): RuleTransition {
  if (state.pendingMelee !== null) {
    throw new Error("Cannot advance phase while a Melee sequence is pending.");
  }
  const flow = state.roundFlow;
  if (!flow) {
    throw new Error("Cannot advance phase before a round has begun.");
  }
  if (flow.phase !== expected) {
    throw new Error(`Expected ${expected} phase, received ${flow.phase}.`);
  }

  const nextFlow: RoundFlowState = {
    ...flow,
    phase: next,
    priorityPlayerId: next === "action" ? flow.firstPlayerId : null
  };
  const sequence = state.eventSequence + 1;
  const event: GameEvent<
    "phase.action.started" | "phase.end-round.started",
    { readonly round: number }
  > = {
    gameId: state.gameId,
    sequence,
    type: eventType,
    actorId: null,
    payload: { round: flow.round }
  };

  const nextState: GameState = {
    ...state,
    roundFlow: nextFlow,
    scenario: state.scenario
      ? { ...state.scenario, round: flow.round, phase: next }
      : state.scenario,
    eventSequence: sequence
  };
  assertStateInvariants(nextState);
  return { nextState, events: [event] };
}

function assertKnownPlayer(state: GameState, playerId: PlayerId): void {
  if (!state.players[playerId]) {
    throw new Error(`Unknown first player ${playerId}.`);
  }
}

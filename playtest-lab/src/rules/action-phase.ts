import type { GameState, PlayerId, RoundFlowState } from "../engine/types.js";

export interface PostActionPriorityResolution {
  readonly roundFlow: RoundFlowState;
  readonly actionPhaseEnded: boolean;
  /**
   * True when the nominal next player had no active on-field unit and priority
   * immediately returned to the acting player under the sourced FAQ "lob" rule.
   */
  readonly skippedUnavailableOpponent: boolean;
}

/** Return whether a player currently has a ready unit available on the battlefield. */
export function hasActiveBattlefieldUnit(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  if (!player) return false;
  return player.unitIds.some((unitId) => {
    const unit = state.units[unitId];
    return unit?.ownerId === playerId && unit.territoryId !== null && unit.activation === "ready";
  });
}

/**
 * Resolve Action Phase priority after one action has completely resolved.
 *
 * Sourced sequence:
 * - priority normally passes to the opponent,
 * - if that player has no active unit, priority immediately lobs back,
 * - if neither player has an active unit across those consecutive checks,
 *   the Action Phase ends.
 *
 * The input state must already reflect the completed action (including the
 * acting unit's deactivation). This helper does not emit events or mutate any
 * other gameplay state; action resolvers can compose it into one atomic result.
 */
export function resolvePostActionPriority(
  state: GameState,
  actingPlayerId: PlayerId
): PostActionPriorityResolution {
  const flow = state.roundFlow;
  if (!flow || flow.phase !== "action") {
    throw new Error("Post-action priority can only be resolved during the Action Phase.");
  }
  if (!state.players[actingPlayerId]) {
    throw new Error(`Unknown acting player ${actingPlayerId}.`);
  }

  const opponentId = opposingPlayerId(state, actingPlayerId);
  const opponentHasActiveUnit = hasActiveBattlefieldUnit(state, opponentId);
  if (opponentHasActiveUnit) {
    return {
      roundFlow: { ...flow, priorityPlayerId: opponentId },
      actionPhaseEnded: false,
      skippedUnavailableOpponent: false
    };
  }

  const actorHasActiveUnit = hasActiveBattlefieldUnit(state, actingPlayerId);
  if (actorHasActiveUnit) {
    return {
      roundFlow: { ...flow, priorityPlayerId: actingPlayerId },
      actionPhaseEnded: false,
      skippedUnavailableOpponent: true
    };
  }

  return {
    roundFlow: { ...flow, phase: "end-round", priorityPlayerId: null },
    actionPhaseEnded: true,
    skippedUnavailableOpponent: true
  };
}

function opposingPlayerId(state: GameState, playerId: PlayerId): PlayerId {
  const opponents = Object.keys(state.players).filter((candidate) => candidate !== playerId);
  if (opponents.length !== 1 || !opponents[0]) {
    throw new Error(`Strikeforce action priority requires exactly one opposing player; found ${opponents.length}.`);
  }
  return opponents[0];
}

import type {
  EngineAction,
  ResolutionResult,
  RulesEngine,
  ValidationResult
} from "../engine/actions.js";
import type { GameEvent } from "../engine/events.js";
import type { RandomSource } from "../engine/rng.js";
import type { GameState, PlayerId } from "../engine/types.js";

export type SyntheticAction = EngineAction<"synthetic.noop", { readonly label: string }>;

/**
 * A deliberately mechanics-free engine used only to test orchestration.
 * It must never be wired to production Strikeforce gameplay.
 */
export class SyntheticRulesEngine implements RulesEngine<SyntheticAction> {
  getLegalActions(state: GameState, playerId: PlayerId): readonly SyntheticAction[] {
    if (state.lifecycle === "complete" || !state.players[playerId]) {
      return [];
    }

    return ["A", "B"].map((variant) => ({
      id: `synthetic.noop:${playerId}:${state.eventSequence}:${variant}`,
      type: "synthetic.noop" as const,
      playerId,
      basedOnEventSequence: state.eventSequence,
      payload: { label: `Synthetic orchestration action ${variant}` }
    }));
  }

  validateAction(state: GameState, action: SyntheticAction): ValidationResult {
    const errors = [];

    if (!state.players[action.playerId]) {
      errors.push({
        code: "PLAYER_MISSING",
        message: `Player ${action.playerId} does not exist in the state.`
      });
    }

    if (action.basedOnEventSequence !== state.eventSequence) {
      errors.push({
        code: "STALE_ACTION",
        message: `Action was based on event sequence ${action.basedOnEventSequence}; current sequence is ${state.eventSequence}.`
      });
    }

    return errors.length === 0 ? { valid: true } : { valid: false, errors };
  }

  applyAction(
    state: GameState,
    action: SyntheticAction,
    _rng: RandomSource
  ): ResolutionResult {
    const validation = this.validateAction(state, action);
    if (!validation.valid) {
      const firstError = validation.errors[0];
      if (!firstError) {
        throw new Error("Invalid validation result must include at least one error.");
      }
      return {
        accepted: false,
        nextState: state,
        events: [],
        error: firstError
      };
    }

    const nextSequence = state.eventSequence + 1;
    const event: GameEvent<
      "synthetic.noop.applied",
      { readonly actionId: string; readonly label: string }
    > = {
      gameId: state.gameId,
      sequence: nextSequence,
      type: "synthetic.noop.applied",
      actorId: action.playerId,
      payload: {
        actionId: action.id,
        label: action.payload.label
      }
    };

    return {
      accepted: true,
      nextState: {
        ...state,
        eventSequence: nextSequence
      },
      events: [event]
    };
  }
}

import type { EngineAction, RulesEngine } from "../engine/actions.js";
import type { GameEvent } from "../engine/events.js";
import type { RandomSource } from "../engine/rng.js";
import { assertResolutionIntegrity } from "../engine/transition.js";
import type { GameState, PlayerId } from "../engine/types.js";
import type { PlayerPolicy } from "./policy.js";

export type SimulationStopReason =
  | "game-complete"
  | "max-steps"
  | "no-legal-action"
  | "action-rejected";

export interface SimulationStep<TAction extends EngineAction = EngineAction> {
  readonly index: number;
  readonly playerId: PlayerId;
  readonly policyId: string;
  readonly action: TAction | null;
  readonly accepted: boolean;
  readonly emittedEvents: readonly GameEvent[];
}

export interface SimulationResult<TAction extends EngineAction = EngineAction> {
  readonly finalState: GameState;
  readonly steps: readonly SimulationStep<TAction>[];
  readonly events: readonly GameEvent[];
  readonly stopReason: SimulationStopReason;
}

export type PlayerSelector = (
  state: GameState,
  stepIndex: number,
  playerIds: readonly PlayerId[]
) => PlayerId;

export interface SimulationInput<TAction extends EngineAction = EngineAction> {
  readonly engine: RulesEngine<TAction>;
  readonly initialState: GameState;
  readonly policies: Readonly<Record<PlayerId, PlayerPolicy<TAction>>>;
  readonly rng: RandomSource;
  readonly maxSteps: number;
  /**
   * Turn/priority selection is injected because RG-001 is unresolved.
   * The runner must not encode a guessed Strikeforce turn model.
   */
  readonly selectPlayer: PlayerSelector;
}

export function runSimulation<TAction extends EngineAction>(
  input: SimulationInput<TAction>
): SimulationResult<TAction> {
  if (!Number.isInteger(input.maxSteps) || input.maxSteps < 0) {
    throw new Error("maxSteps must be a non-negative integer.");
  }

  const playerIds = Object.keys(input.policies);
  if (playerIds.length === 0) {
    throw new Error("At least one player policy is required.");
  }

  let state = input.initialState;
  const steps: SimulationStep<TAction>[] = [];
  const events: GameEvent[] = [];

  for (let stepIndex = 0; stepIndex < input.maxSteps; stepIndex += 1) {
    if (state.lifecycle === "complete") {
      return { finalState: state, steps, events, stopReason: "game-complete" };
    }

    const playerId = input.selectPlayer(state, stepIndex, playerIds);
    const policy = input.policies[playerId];
    if (!policy) {
      throw new Error(`selectPlayer returned ${playerId}, which has no policy.`);
    }

    const legalActions = input.engine.getLegalActions(state, playerId);
    const action = policy.chooseAction({
      state,
      playerId,
      legalActions,
      rng: input.rng
    });

    if (!action) {
      steps.push({
        index: stepIndex,
        playerId,
        policyId: policy.id,
        action: null,
        accepted: false,
        emittedEvents: []
      });
      return { finalState: state, steps, events, stopReason: "no-legal-action" };
    }

    const result = input.engine.applyAction(state, action, input.rng);
    assertResolutionIntegrity(state, result);
    steps.push({
      index: stepIndex,
      playerId,
      policyId: policy.id,
      action,
      accepted: result.accepted,
      emittedEvents: result.events
    });

    if (!result.accepted) {
      return {
        finalState: state,
        steps,
        events,
        stopReason: "action-rejected"
      };
    }

    state = result.nextState;
    events.push(...result.events);
  }

  return { finalState: state, steps, events, stopReason: "max-steps" };
}

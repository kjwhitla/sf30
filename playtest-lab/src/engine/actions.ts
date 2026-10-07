import type { GameEvent } from "./events.js";
import type { GameState, PlayerId } from "./types.js";
import type { RandomSource } from "./rng.js";

export type ActionId = string;

/**
 * Mechanics-neutral action envelope.
 * Concrete action types (move/shoot/melee/etc.) are deliberately not declared
 * until their canonical legality and resolution rules are sourced.
 */
export interface EngineAction<TType extends string = string, TPayload = unknown> {
  readonly id: ActionId;
  readonly type: TType;
  readonly playerId: PlayerId;
  readonly basedOnEventSequence: number;
  readonly payload: TPayload;
}

export interface RuleError {
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type ValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly RuleError[] };

export interface ResolutionResult {
  readonly accepted: boolean;
  readonly nextState: GameState;
  readonly events: readonly GameEvent[];
  readonly error?: RuleError;
}

/**
 * Stable contract implemented by the canonical rules layer later.
 * UI, bots, simulations, and reasoning agents must depend on this boundary,
 * never on private rule internals.
 */
export interface RulesEngine<TAction extends EngineAction = EngineAction> {
  getLegalActions(state: GameState, playerId: PlayerId): readonly TAction[];
  validateAction(state: GameState, action: TAction): ValidationResult;
  applyAction(state: GameState, action: TAction, rng: RandomSource): ResolutionResult;
}

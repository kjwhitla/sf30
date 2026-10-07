import type { EngineAction } from "../engine/actions.js";
import type { RandomSource } from "../engine/rng.js";
import type { GameState, PlayerId } from "../engine/types.js";

export interface PolicyContext<TAction extends EngineAction = EngineAction> {
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly legalActions: readonly TAction[];
  readonly rng: RandomSource;
}

export interface PlayerPolicy<TAction extends EngineAction = EngineAction> {
  readonly id: string;
  chooseAction(context: PolicyContext<TAction>): TAction | null;
}

export class FirstLegalPolicy<TAction extends EngineAction = EngineAction>
  implements PlayerPolicy<TAction>
{
  readonly id = "first-legal";

  chooseAction(context: PolicyContext<TAction>): TAction | null {
    return context.legalActions[0] ?? null;
  }
}

export class RandomLegalPolicy<TAction extends EngineAction = EngineAction>
  implements PlayerPolicy<TAction>
{
  readonly id = "random-legal";

  chooseAction(context: PolicyContext<TAction>): TAction | null {
    return context.legalActions.length === 0
      ? null
      : context.rng.pick(context.legalActions);
  }
}

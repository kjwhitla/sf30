import type { GameId, PlayerId } from "./types.js";

/**
 * Append-only engine event envelope.
 * Specific gameplay event payloads will be added only as canonical rules are
 * encoded. Keeping the envelope stable now enables deterministic replay later.
 */
export interface GameEvent<TType extends string = string, TPayload = unknown> {
  readonly gameId: GameId;
  readonly sequence: number;
  readonly type: TType;
  readonly actorId: PlayerId | null;
  readonly payload: TPayload;
}

export type GameCreatedEvent = GameEvent<
  "game.created",
  {
    readonly seed: number;
  }
>;

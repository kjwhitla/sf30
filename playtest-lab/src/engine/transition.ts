import type { ResolutionResult } from "./actions.js";
import { assertStateInvariants } from "./invariants.js";
import type { GameState } from "./types.js";

/**
 * Validates engine-output integrity without interpreting any Strikeforce rule.
 * Simulation data is only trustworthy if accepted transitions preserve the
 * structural state contract and append contiguous events.
 */
export function assertResolutionIntegrity(
  previousState: GameState,
  result: ResolutionResult
): void {
  if (result.nextState.gameId !== previousState.gameId) {
    throw new Error("Resolution changed gameId.");
  }

  if (!result.accepted) {
    if (result.events.length !== 0) {
      throw new Error("Rejected resolution must not emit events.");
    }
    if (result.nextState.eventSequence !== previousState.eventSequence) {
      throw new Error("Rejected resolution must not advance eventSequence.");
    }
    assertStateInvariants(result.nextState);
    return;
  }

  if (result.events.length === 0) {
    throw new Error("Accepted resolution must emit at least one event.");
  }

  let expectedSequence = previousState.eventSequence + 1;
  for (const event of result.events) {
    if (event.gameId !== previousState.gameId) {
      throw new Error(`Resolution event ${event.type} references the wrong gameId.`);
    }
    if (event.sequence !== expectedSequence) {
      throw new Error(
        `Resolution event sequence mismatch: expected ${expectedSequence}, received ${event.sequence}.`
      );
    }
    expectedSequence += 1;
  }

  const finalEvent = result.events[result.events.length - 1];
  if (!finalEvent) {
    throw new Error("Accepted resolution unexpectedly had no final event.");
  }
  if (result.nextState.eventSequence !== finalEvent.sequence) {
    throw new Error(
      `Resolved state eventSequence ${result.nextState.eventSequence} does not match final event ${finalEvent.sequence}.`
    );
  }

  assertStateInvariants(result.nextState);
}

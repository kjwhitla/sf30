import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "../dist/engine/state.js";
import { assertResolutionIntegrity } from "../dist/engine/transition.js";

function state() {
  return createInitialGameState({ gameId: "transition-test", seed: 1 });
}

test("accepted resolutions require contiguous events and matching final sequence", () => {
  const initial = state();
  assert.doesNotThrow(() =>
    assertResolutionIntegrity(initial, {
      accepted: true,
      nextState: { ...initial, eventSequence: 2 },
      events: [
        { gameId: initial.gameId, sequence: 1, type: "test.one", actorId: null, payload: {} },
        { gameId: initial.gameId, sequence: 2, type: "test.two", actorId: null, payload: {} }
      ]
    })
  );
});

test("accepted resolutions reject missing or discontinuous events", () => {
  const initial = state();
  assert.throws(
    () =>
      assertResolutionIntegrity(initial, {
        accepted: true,
        nextState: { ...initial, eventSequence: 1 },
        events: []
      }),
    /at least one event/
  );
  assert.throws(
    () =>
      assertResolutionIntegrity(initial, {
        accepted: true,
        nextState: { ...initial, eventSequence: 2 },
        events: [
          { gameId: initial.gameId, sequence: 2, type: "test.bad", actorId: null, payload: {} }
        ]
      }),
    /sequence mismatch/
  );
});

test("rejected resolutions cannot mutate event progression", () => {
  const initial = state();
  assert.throws(
    () =>
      assertResolutionIntegrity(initial, {
        accepted: false,
        nextState: { ...initial, eventSequence: 1 },
        events: []
      }),
    /must not advance eventSequence/
  );
});

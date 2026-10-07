import assert from "node:assert/strict";
import test from "node:test";
import { appendEvent, validateEventLog } from "../dist/engine/replay.js";

const event = (sequence) => ({
  gameId: "game-1",
  sequence,
  type: "test.event",
  actorId: null,
  payload: {}
});

test("appendEvent enforces contiguous sequence numbers", () => {
  const first = appendEvent([], event(1));
  const second = appendEvent(first, event(2));
  assert.equal(second.length, 2);
  assert.throws(() => appendEvent(second, event(4)), /expected 3/);
});

test("validateEventLog rejects gaps", () => {
  assert.doesNotThrow(() => validateEventLog([event(1), event(2), event(3)]));
  assert.throws(() => validateEventLog([event(1), event(3)]), /expected 2/);
});

import type { GameEvent } from "./events.js";

export function appendEvent<TEvent extends GameEvent>(
  log: readonly TEvent[],
  event: TEvent
): readonly TEvent[] {
  const expected = log.length === 0 ? 1 : (log[log.length - 1]?.sequence ?? 0) + 1;
  if (event.sequence !== expected) {
    throw new Error(`Event sequence mismatch: expected ${expected}, received ${event.sequence}.`);
  }
  return [...log, event];
}

export function validateEventLog(log: readonly GameEvent[]): void {
  let expected = 1;
  for (const event of log) {
    if (event.sequence !== expected) {
      throw new Error(`Event sequence mismatch at ${event.type}: expected ${expected}, received ${event.sequence}.`);
    }
    expected += 1;
  }
}

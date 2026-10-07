import assert from "node:assert/strict";
import test from "node:test";
import { SeededRng } from "../dist/engine/rng.js";

test("same seed produces the same sequence", () => {
  const left = new SeededRng(30);
  const right = new SeededRng(30);
  const a = Array.from({ length: 20 }, () => left.nextFloat());
  const b = Array.from({ length: 20 }, () => right.nextFloat());
  assert.deepEqual(a, b);
});

test("different seeds produce different sequences", () => {
  const left = new SeededRng(30);
  const right = new SeededRng(31);
  const a = Array.from({ length: 5 }, () => left.nextFloat());
  const b = Array.from({ length: 5 }, () => right.nextFloat());
  assert.notDeepEqual(a, b);
});

test("nextInt stays inside the requested range", () => {
  const rng = new SeededRng(12345);
  for (let index = 0; index < 1000; index += 1) {
    const result = rng.nextInt(6);
    assert.ok(result >= 0 && result < 6);
  }
});

test("pick rejects an empty collection", () => {
  const rng = new SeededRng(1);
  assert.throws(() => rng.pick([]), /empty collection/);
});

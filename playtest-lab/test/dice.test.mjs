import assert from "node:assert/strict";
import test from "node:test";
import { SeededRng } from "../dist/engine/rng.js";
import { FATE_DIE_FACES, MAX_DEFENSE_DICE, rollDefense, rollFateDice } from "../dist/rules/dice.js";

test("Fate Die numeric faces match Live Working Version", () => {
  assert.deepEqual([...FATE_DIE_FACES], [0, 0, 1, 1, 1, 2]);
});

test("Fate rolls are deterministic for a seed", () => {
  const a = rollFateDice(20, new SeededRng(30));
  const b = rollFateDice(20, new SeededRng(30));
  assert.deepEqual(a, b);
});

test("Defense rolls cap at six dice", () => {
  const roll = rollDefense(12, new SeededRng(7));
  assert.equal(MAX_DEFENSE_DICE, 6);
  assert.equal(roll.dice.length, 6);
});

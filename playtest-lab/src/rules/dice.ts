import type { RandomSource } from "../engine/rng.js";

/** Numeric Fate Die faces confirmed by the Live Working Version. */
export const FATE_DIE_FACES = Object.freeze([0, 0, 1, 1, 1, 2] as const);
export const MAX_DEFENSE_DICE = 6 as const;

export interface FateRoll {
  readonly dice: readonly number[];
  readonly total: number;
}

export function rollFateDice(count: number, rng: RandomSource): FateRoll {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("Fate Die count must be a non-negative integer.");
  }

  const dice: number[] = [];
  for (let index = 0; index < count; index += 1) {
    dice.push(FATE_DIE_FACES[rng.nextInt(FATE_DIE_FACES.length)] ?? 0);
  }
  return {
    dice,
    total: dice.reduce((sum, value) => sum + value, 0)
  };
}

export function rollDefense(defenseStat: number, rng: RandomSource): FateRoll {
  if (!Number.isInteger(defenseStat) || defenseStat < 0) {
    throw new Error("Defense stat must be a non-negative integer.");
  }
  return rollFateDice(Math.min(MAX_DEFENSE_DICE, defenseStat), rng);
}

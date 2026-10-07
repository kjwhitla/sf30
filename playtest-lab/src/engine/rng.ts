export interface RandomSource {
  nextFloat(): number;
  nextInt(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
}

/**
 * Small deterministic PRNG for replayable rules resolution.
 * It is not cryptographic and must not be used for security-sensitive work.
 */
export class SeededRng implements RandomSource {
  private state: number;

  constructor(seed: number) {
    if (!Number.isFinite(seed)) {
      throw new Error("Seed must be a finite number.");
    }
    this.state = normalizeSeed(seed);
  }

  nextFloat(): number {
    // Mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error("maxExclusive must be a positive integer.");
    }
    return Math.floor(this.nextFloat() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty collection.");
    }
    const item = items[this.nextInt(items.length)];
    if (item === undefined) {
      throw new Error("Random selection produced an invalid index.");
    }
    return item;
  }
}

export function normalizeSeed(seed: number): number {
  return Math.trunc(seed) >>> 0;
}

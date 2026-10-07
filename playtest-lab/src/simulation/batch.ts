import { normalizeSeed, SeededRng } from "../engine/rng.js";
import type { EngineAction, RulesEngine } from "../engine/actions.js";
import type { GameState, PlayerId } from "../engine/types.js";
import type { PlayerPolicy } from "./policy.js";
import {
  runSimulation,
  type PlayerSelector,
  type SimulationResult
} from "./runner.js";
import { buildMatchTelemetry, type MatchTelemetry } from "./telemetry.js";

export interface BatchMatchDefinition<TAction extends EngineAction = EngineAction> {
  readonly engine: RulesEngine<TAction>;
  readonly initialState: GameState;
  readonly policies: Readonly<Record<PlayerId, PlayerPolicy<TAction>>>;
  readonly maxSteps: number;
  readonly selectPlayer: PlayerSelector;
}

export interface BatchMatchContext {
  readonly batchId: string;
  readonly matchIndex: number;
  readonly seed: number;
  readonly matchId: string;
}

export interface SimulationBatchInput<TAction extends EngineAction = EngineAction> {
  readonly batchId: string;
  readonly baseSeed: number;
  readonly matchCount: number;
  readonly createMatch: (
    context: BatchMatchContext
  ) => BatchMatchDefinition<TAction>;
}

export interface SimulationBatchMatch<TAction extends EngineAction = EngineAction> {
  readonly matchId: string;
  readonly matchIndex: number;
  readonly seed: number;
  readonly result: SimulationResult<TAction>;
  readonly telemetry: MatchTelemetry;
}

export interface SimulationBatchResult<TAction extends EngineAction = EngineAction> {
  readonly batchId: string;
  readonly baseSeed: number;
  readonly matches: readonly SimulationBatchMatch<TAction>[];
}

export function runSimulationBatch<TAction extends EngineAction>(
  input: SimulationBatchInput<TAction>
): SimulationBatchResult<TAction> {
  assertBatchInput(input);
  const matches: SimulationBatchMatch<TAction>[] = [];

  for (let matchIndex = 0; matchIndex < input.matchCount; matchIndex += 1) {
    const seed = deriveMatchSeed(input.baseSeed, matchIndex);
    const matchId = `${input.batchId}:${matchIndex}`;
    const definition = input.createMatch({
      batchId: input.batchId,
      matchIndex,
      seed,
      matchId
    });

    if (definition.initialState.seed !== seed) {
      throw new Error(
        `Match ${matchId} initialState.seed ${definition.initialState.seed} does not match derived seed ${seed}.`
      );
    }

    const result = runSimulation({
      ...definition,
      rng: new SeededRng(seed)
    });

    matches.push({
      matchId,
      matchIndex,
      seed,
      result,
      telemetry: buildMatchTelemetry({
        batchId: input.batchId,
        matchId,
        matchIndex,
        seed,
        initialState: definition.initialState,
        policies: definition.policies,
        result
      })
    });
  }

  return {
    batchId: input.batchId,
    baseSeed: normalizeSeed(input.baseSeed),
    matches
  };
}

/**
 * Stable seed derivation for independent, replayable matches. This is not game
 * randomness itself; it deterministically assigns each match its own RNG seed.
 */
export function deriveMatchSeed(baseSeed: number, matchIndex: number): number {
  if (!Number.isInteger(matchIndex) || matchIndex < 0) {
    throw new Error("matchIndex must be a non-negative integer.");
  }

  let value = (normalizeSeed(baseSeed) + Math.imul(matchIndex + 1, 0x9e3779b9)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

function assertBatchInput(input: SimulationBatchInput): void {
  if (input.batchId.trim().length === 0) {
    throw new Error("batchId must not be empty.");
  }
  if (!Number.isFinite(input.baseSeed)) {
    throw new Error("baseSeed must be finite.");
  }
  if (!Number.isInteger(input.matchCount) || input.matchCount < 0) {
    throw new Error("matchCount must be a non-negative integer.");
  }
}

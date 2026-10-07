import type { EngineAction } from "../engine/actions.js";
import { assertSourcesPresent, type RuleSourceRef, type SourcedDefinition } from "../engine/provenance.js";
import type { PlayerId } from "../engine/types.js";
import {
  runSimulationBatch,
  type BatchMatchContext,
  type BatchMatchDefinition,
  type SimulationBatchResult
} from "./batch.js";
import type { MatchTelemetry } from "./telemetry.js";

export interface ExperimentVariant extends SourcedDefinition {
  readonly id: string;
  readonly name: string;
  readonly policyAssignments: Readonly<Record<PlayerId, string>>;
  readonly tags: readonly string[];
}

export interface ExperimentManifest extends SourcedDefinition {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly baseSeed: number;
  readonly repetitions: number;
  readonly variants: readonly ExperimentVariant[];
}

export interface ExperimentRunInput<TAction extends EngineAction = EngineAction> {
  readonly manifest: ExperimentManifest;
  readonly createMatch: (
    variant: ExperimentVariant,
    context: BatchMatchContext
  ) => BatchMatchDefinition<TAction>;
}

export interface ExperimentVariantResult<TAction extends EngineAction = EngineAction> {
  readonly variant: ExperimentVariant;
  readonly batch: SimulationBatchResult<TAction>;
}

export interface ExperimentRunResult<TAction extends EngineAction = EngineAction> {
  readonly manifest: ExperimentManifest;
  readonly variants: readonly ExperimentVariantResult<TAction>[];
  readonly fingerprint: string;
}

/**
 * Run each variant over the exact same derived seed sequence. This creates
 * paired-seed experiments: repetition N has the same seed in every variant.
 */
export function runExperiment<TAction extends EngineAction>(
  input: ExperimentRunInput<TAction>
): ExperimentRunResult<TAction> {
  validateExperimentManifest(input.manifest);

  const variants = input.manifest.variants.map((variant) => ({
    variant,
    batch: runSimulationBatch({
      batchId: `${input.manifest.id}:${variant.id}`,
      baseSeed: input.manifest.baseSeed,
      matchCount: input.manifest.repetitions,
      createMatch: (context) => input.createMatch(variant, context)
    })
  }));

  const resultWithoutFingerprint = {
    manifest: input.manifest,
    variants
  };

  return {
    ...resultWithoutFingerprint,
    fingerprint: fingerprintValue(resultWithoutFingerprint)
  };
}

export function createPolicyMatrixVariants(input: {
  readonly playerIds: readonly PlayerId[];
  readonly policyIds: readonly string[];
  readonly sources: readonly RuleSourceRef[];
}): readonly ExperimentVariant[] {
  if (input.playerIds.length === 0) {
    throw new Error("Policy matrix requires at least one player id.");
  }
  if (input.policyIds.length === 0) {
    throw new Error("Policy matrix requires at least one policy id.");
  }
  assertUniqueStrings(input.playerIds, "player id");
  assertUniqueStrings(input.policyIds, "policy id");
  assertSourcesPresent(input.sources, "Policy matrix variants");

  const assignments: Array<Record<PlayerId, string>> = [];

  function visit(playerIndex: number, current: Record<PlayerId, string>): void {
    if (playerIndex === input.playerIds.length) {
      assignments.push({ ...current });
      return;
    }

    const playerId = input.playerIds[playerIndex];
    if (!playerId) {
      throw new Error("Policy matrix player index is invalid.");
    }

    for (const policyId of input.policyIds) {
      current[playerId] = policyId;
      visit(playerIndex + 1, current);
    }
    delete current[playerId];
  }

  visit(0, {});

  return assignments.map((policyAssignments) => {
    const descriptor = input.playerIds
      .map((playerId) => `${playerId}=${policyAssignments[playerId]}`)
      .join("__");

    return {
      id: descriptor,
      name: descriptor,
      policyAssignments,
      tags: ["policy-matrix"],
      sources: input.sources
    };
  });
}

export function validateExperimentManifest(manifest: ExperimentManifest): void {
  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported experiment schema version ${manifest.schemaVersion}.`);
  }
  if (manifest.id.trim().length === 0) {
    throw new Error("Experiment id must not be empty.");
  }
  if (manifest.name.trim().length === 0) {
    throw new Error("Experiment name must not be empty.");
  }
  if (!Number.isFinite(manifest.baseSeed)) {
    throw new Error("Experiment baseSeed must be finite.");
  }
  if (!Number.isInteger(manifest.repetitions) || manifest.repetitions < 1) {
    throw new Error("Experiment repetitions must be a positive integer.");
  }
  if (manifest.variants.length === 0) {
    throw new Error("Experiment must contain at least one variant.");
  }

  assertSourcesPresent(manifest.sources, `Experiment ${manifest.id}`);
  assertUniqueStrings(manifest.variants.map((variant) => variant.id), "variant id");

  for (const variant of manifest.variants) {
    if (variant.id.trim().length === 0 || variant.name.trim().length === 0) {
      throw new Error("Experiment variants require non-empty id and name.");
    }
    if (Object.keys(variant.policyAssignments).length === 0) {
      throw new Error(`Experiment variant ${variant.id} has no policy assignments.`);
    }
    assertSourcesPresent(variant.sources, `Experiment variant ${variant.id}`);
  }
}

/** Stable, dependency-free fingerprint for reproducibility checks. */
export function fingerprintValue(value: unknown): string {
  const canonical = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}

export function fingerprintTelemetry(matches: readonly MatchTelemetry[]): string {
  return fingerprintValue(matches);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function assertUniqueStrings(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (value.trim().length === 0) {
      throw new Error(`${label} must not be empty.`);
    }
    if (seen.has(value)) {
      throw new Error(`Duplicate ${label} ${value}.`);
    }
    seen.add(value);
  }
}

import { assertSourcesPresent } from "../engine/provenance.js";
import type { RuleSourceRef } from "../engine/provenance.js";
import type { GameCatalog } from "./types.js";

function assertRecordIds<T extends { readonly id: string; readonly sources: readonly RuleSourceRef[] }>(
  record: Readonly<Record<string, T>>,
  label: string
): void {
  for (const [key, value] of Object.entries(record)) {
    if (key !== value.id) {
      throw new Error(`${label} record key ${key} does not match definition id ${value.id}.`);
    }
    assertSourcesPresent(value.sources, `${label} ${value.id}`);
  }
}

export function validateGameCatalog(catalog: GameCatalog): void {
  assertRecordIds(catalog.factions, "Faction");
  assertRecordIds(catalog.units, "Unit");
  assertRecordIds(catalog.territories, "Territory");
  assertRecordIds(catalog.dice, "Die");
  assertRecordIds(catalog.scenarios, "Scenario");

  for (const unit of Object.values(catalog.units)) {
    if (!catalog.factions[unit.factionId]) {
      throw new Error(
        `Unit ${unit.id} references missing faction ${unit.factionId}.`
      );
    }
  }

  for (const die of Object.values(catalog.dice)) {
    const faceIds = new Set<string>();
    for (const face of die.faces) {
      if (faceIds.has(face.id)) {
        throw new Error(`Die ${die.id} contains duplicate face id ${face.id}.`);
      }
      faceIds.add(face.id);
    }
  }
}

export function loadGameCatalog(catalog: GameCatalog): GameCatalog {
  validateGameCatalog(catalog);
  return catalog;
}

export function serializeGameCatalog(catalog: GameCatalog): string {
  validateGameCatalog(catalog);
  return JSON.stringify(catalog);
}

export function deserializeGameCatalog(serialized: string): GameCatalog {
  const value: unknown = JSON.parse(serialized);
  assertCatalogEnvelope(value);
  validateGameCatalog(value);
  return value;
}

function assertCatalogEnvelope(value: unknown): asserts value is GameCatalog {
  if (!isRecord(value)) {
    throw new Error("Serialized game catalog must be an object.");
  }

  for (const key of ["factions", "units", "territories", "dice", "scenarios"] as const) {
    if (!isRecord(value[key])) {
      throw new Error(`GameCatalog.${key} must be an object record.`);
    }

    for (const [entryKey, entry] of Object.entries(value[key])) {
      if (!isRecord(entry)) {
        throw new Error(`GameCatalog.${key}.${entryKey} must be an object.`);
      }
      if (typeof entry.id !== "string" || entry.id.trim() === "") {
        throw new Error(`GameCatalog.${key}.${entryKey} must have a non-empty id.`);
      }
      if (!Array.isArray(entry.sources)) {
        throw new Error(`GameCatalog.${key}.${entryKey} must include sources.`);
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

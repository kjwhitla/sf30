import type {
  FactionId,
  ScenarioId,
  TerritoryId,
  UnitDefinitionId,
  UnitDefinition
} from "../engine/types.js";
import type { SourcedDefinition } from "../engine/provenance.js";

export type DieDefinitionId = string;

/**
 * Immutable catalog definitions. These describe authored game content, not
 * mutable match state. Mechanics that are not canonically known remain text
 * or absent rather than being guessed into executable fields.
 */
export interface FactionDefinition extends SourcedDefinition {
  readonly id: FactionId;
  readonly name: string;
}

export interface TerritoryCatalogDefinition extends SourcedDefinition {
  readonly id: TerritoryId;
  readonly name: string;
  readonly territoryClass: string;
  readonly rulesText: readonly string[];
}

export interface DieFaceDefinition {
  readonly id: string;
  readonly symbols: readonly string[];
}

export interface DieDefinition extends SourcedDefinition {
  readonly id: DieDefinitionId;
  readonly name: string;
  readonly faces: readonly DieFaceDefinition[];
}


export interface ScenarioDeploymentRules {
  readonly standardDeployment: boolean;
  readonly maxFriendlyUnitsPerTerritory: number;
  readonly deployToLegalCapacity: boolean;
  readonly actionEconomyException: boolean;
  readonly exceptionReason?: string;
  /** Resolved card/unit deployment permissions for this battlefield. */
  readonly additionalStartingTerritoryIdsByUnitDefinition?: Readonly<Record<UnitDefinitionId, readonly TerritoryId[]>>;
  readonly startingTerritoryIdsByFaction: Readonly<Record<FactionId, readonly TerritoryId[]>>;
}

export interface ScenarioDefinition extends SourcedDefinition {
  readonly id: ScenarioId;
  readonly name: string;
  readonly rulesText: readonly string[];
  readonly deployment?: ScenarioDeploymentRules;
}

export interface GameCatalog {
  readonly factions: Readonly<Record<FactionId, FactionDefinition>>;
  readonly units: Readonly<Record<UnitDefinitionId, UnitDefinition>>;
  readonly territories: Readonly<Record<TerritoryId, TerritoryCatalogDefinition>>;
  readonly dice: Readonly<Record<DieDefinitionId, DieDefinition>>;
  readonly scenarios: Readonly<Record<ScenarioId, ScenarioDefinition>>;
}

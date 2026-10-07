import { validateGameCatalog } from "./catalog.js";
import type { GameCatalog } from "./types.js";
import { createInitialGameState } from "../engine/state.js";
import type {
  ActivationState,
  EffectId,
  GameState,
  PhaseId,
  PlayerId,
  TerritoryControlState,
  TerritoryId,
  UnitDefinitionId,
  UnitId
} from "../engine/types.js";
import type { RuleSourceKind, RuleSourceRef } from "../engine/provenance.js";
import { assertDeploymentInvariant } from "../rules/deployment.js";

export type CatalogSourcePolicy = "authoritative-only" | "allow-test-fixtures";

export interface CatalogPlayerSetup {
  readonly id: PlayerId;
  readonly factionId: string;
  readonly command: number;
  readonly victoryPoints: number;
  readonly unitIds: readonly UnitId[];
}

export interface CatalogUnitSetup {
  readonly id: UnitId;
  readonly definitionId: UnitDefinitionId;
  readonly ownerId: PlayerId;
  readonly territoryId: TerritoryId | null;
  readonly currentHealth: number;
  readonly currentShoot: number | null;
  readonly currentMelee: number | null;
  readonly currentDefense: number | null;
  readonly currentObjectiveControl: number | null;
  readonly activation: ActivationState;
  readonly effectIds: readonly EffectId[];
}

export interface CatalogTerritorySetup {
  readonly id: TerritoryId;
  readonly occupantUnitIds: readonly UnitId[];
  readonly control: TerritoryControlState;
  readonly activation: ActivationState | null;
  readonly effectIds: readonly EffectId[];
}

export interface CatalogScenarioSetup {
  readonly id: string;
  readonly round: number | null;
  readonly phase: PhaseId | null;
}

export interface CatalogGameSetup {
  readonly gameId: string;
  readonly seed: number;
  readonly players: readonly CatalogPlayerSetup[];
  readonly units: readonly CatalogUnitSetup[];
  readonly territories: readonly CatalogTerritorySetup[];
  readonly battlefieldTerritoryIds: readonly TerritoryId[];
  readonly scenario: CatalogScenarioSetup | null;
  /**
   * Defaults to authoritative-only. Synthetic/test fixture data must be opted
   * into explicitly so it cannot leak into real Strikeforce simulations.
   */
  readonly sourcePolicy?: CatalogSourcePolicy;
}

const AUTHORITATIVE_SOURCE_KINDS = new Set<RuleSourceKind>([
  "rulebook",
  "prototype",
  "data-table",
  "owner-decision"
]);

export function createGameStateFromCatalog(
  catalog: GameCatalog,
  setup: CatalogGameSetup
): GameState {
  validateGameCatalog(catalog);
  const sourcePolicy = setup.sourcePolicy ?? "authoritative-only";
  assertUniqueIds(setup.players, "player");
  assertUniqueIds(setup.units, "unit");
  assertUniqueIds(setup.territories, "territory");
  assertBattlefieldOrder(setup.battlefieldTerritoryIds, setup.territories);

  const players = Object.fromEntries(
    setup.players.map((player) => {
      const faction = catalog.factions[player.factionId];
      if (!faction) {
        throw new Error(`Setup player ${player.id} references missing faction ${player.factionId}.`);
      }
      assertExecutableSource(faction.sources, `Faction ${faction.id}`, sourcePolicy);
      return [player.id, { ...player }];
    })
  );

  const usedUnitDefinitionIds = new Set<UnitDefinitionId>();
  const units = Object.fromEntries(
    setup.units.map((unit) => {
      const definition = catalog.units[unit.definitionId];
      if (!definition) {
        throw new Error(`Setup unit ${unit.id} references missing definition ${unit.definitionId}.`);
      }
      assertExecutableSource(definition.sources, `Unit ${definition.id}`, sourcePolicy);
      usedUnitDefinitionIds.add(unit.definitionId);
      return [
        unit.id,
        {
          ...unit,
          wounds: Math.max(0, Math.trunc(definition.stats.health - unit.currentHealth)),
          temporaryStatModifiers: [],
          currentMovement: definition.stats.movement
        }
      ];
    })
  );

  const unitDefinitions = Object.fromEntries(
    [...usedUnitDefinitionIds].map((definitionId) => {
      const definition = catalog.units[definitionId];
      if (!definition) {
        throw new Error(`Setup references missing unit definition ${definitionId}.`);
      }
      return [definitionId, definition];
    })
  );

  const territories = Object.fromEntries(
    setup.territories.map((runtime) => {
      const definition = catalog.territories[runtime.id];
      if (!definition) {
        throw new Error(`Setup references missing territory ${runtime.id}.`);
      }
      assertExecutableSource(definition.sources, `Territory ${definition.id}`, sourcePolicy);
      return [
        runtime.id,
        {
          id: runtime.id,
          name: definition.name,
          territoryClass: definition.territoryClass,
          occupantUnitIds: runtime.occupantUnitIds,
          control: runtime.control,
          activation: runtime.activation,
          effectIds: runtime.effectIds
        }
      ];
    })
  );

  let scenario = null;
  if (setup.scenario !== null) {
    const definition = catalog.scenarios[setup.scenario.id];
    if (!definition) {
      throw new Error(`Setup references missing scenario ${setup.scenario.id}.`);
    }
    assertExecutableSource(definition.sources, `Scenario ${definition.id}`, sourcePolicy);
    const deploymentAssessment = definition.deployment
      ? assertDeploymentInvariant({
          rules: definition.deployment,
          players: setup.players,
          units: setup.units,
          territories: setup.territories
        })
      : null;
    scenario = {
      id: definition.id,
      name: definition.name,
      round: setup.scenario.round,
      phase: setup.scenario.phase,
      deployment: definition.deployment && deploymentAssessment
        ? {
            maxFriendlyUnitsPerTerritory: definition.deployment.maxFriendlyUnitsPerTerritory,
            startingTerritoryIdsByPlayer: Object.fromEntries(
              setup.players.map((player) => [
                player.id,
                [...(definition.deployment?.startingTerritoryIdsByFaction[player.factionId] ?? [])]
              ])
            ),
            actionEconomyException: definition.deployment.actionEconomyException,
            startingTerritorySlotCapacityByPlayer: deploymentAssessment.startingTerritorySlotCapacityByPlayer,
            legalStartingDeploymentCapacityByPlayer: deploymentAssessment.legalStartingDeploymentCapacityByPlayer,
            cardGrantedDeploymentCapacityByPlayer: deploymentAssessment.cardGrantedDeploymentCapacityByPlayer
          }
        : null
    };
  }

  return createInitialGameState({
    gameId: setup.gameId,
    seed: setup.seed,
    players,
    units,
    unitDefinitions,
    territories,
    battlefieldTerritoryIds: setup.battlefieldTerritoryIds,
    scenario
  });
}

function assertExecutableSource(
  sources: readonly RuleSourceRef[],
  context: string,
  policy: CatalogSourcePolicy
): void {
  if (policy === "allow-test-fixtures") {
    return;
  }

  if (!sources.some((source) => AUTHORITATIVE_SOURCE_KINDS.has(source.kind))) {
    throw new Error(
      `${context} has no authoritative executable source. ` +
        "Expected rulebook, prototype, data-table, or owner-decision provenance."
    );
  }
}

function assertUniqueIds(
  items: readonly { readonly id: string }[],
  label: string
): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      throw new Error(`Setup contains duplicate ${label} id ${item.id}.`);
    }
    seen.add(item.id);
  }
}


function assertBattlefieldOrder(
  order: readonly TerritoryId[],
  territories: readonly CatalogTerritorySetup[]
): void {
  const territoryIds = new Set(territories.map((territory) => territory.id));
  const seen = new Set<TerritoryId>();
  for (const territoryId of order) {
    if (!territoryIds.has(territoryId)) {
      throw new Error(`Battlefield order references unknown territory ${territoryId}.`);
    }
    if (seen.has(territoryId)) {
      throw new Error(`Battlefield order contains duplicate territory ${territoryId}.`);
    }
    seen.add(territoryId);
  }
  if (seen.size !== territoryIds.size) {
    throw new Error("Battlefield order must include every runtime territory exactly once.");
  }
}

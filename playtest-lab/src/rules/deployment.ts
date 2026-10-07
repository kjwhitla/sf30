import type { ScenarioDeploymentRules } from "../data/types.js";
import type { PlayerId, TerritoryId, UnitDefinitionId, UnitId } from "../engine/types.js";

export interface DeploymentPlayerInput {
  readonly id: PlayerId;
  readonly factionId: string;
  readonly unitIds: readonly UnitId[];
}

export interface DeploymentUnitInput {
  readonly id: UnitId;
  readonly definitionId: UnitDefinitionId;
  readonly ownerId: PlayerId;
  readonly territoryId: TerritoryId | null;
}

export interface DeploymentTerritoryInput {
  readonly id: TerritoryId;
}

export interface DeploymentInvariantIssue {
  readonly code: string;
  readonly message: string;
  readonly playerId?: PlayerId;
  readonly territoryId?: TerritoryId;
}

export interface DeploymentInvariantAssessment {
  readonly ok: boolean;
  readonly issues: readonly DeploymentInvariantIssue[];
  readonly warnings: readonly DeploymentInvariantIssue[];
  readonly deployedCountByPlayer: Readonly<Record<PlayerId, number>>;
  readonly baselineActivationCountByPlayer: Readonly<Record<PlayerId, number>>;
  readonly startingTerritorySlotCapacityByPlayer: Readonly<Record<PlayerId, number>>;
  readonly legalStartingDeploymentCapacityByPlayer: Readonly<Record<PlayerId, number>>;
  readonly cardGrantedDeploymentCapacityByPlayer: Readonly<Record<PlayerId, number>>;
}

/**
 * Validate the owner-approved deployment/action-economy invariant.
 *
 * There is no global six-unit starting cap. Legal starting deployment capacity
 * is derived from the scenario's allotted starting territories, the per-territory
 * friendly-unit limit, the army actually brought, and explicitly resolved
 * card/unit deployment rules. Six is merely a common result of two starting
 * territories with three friendly slots each.
 */
export function assessDeploymentInvariant(input: {
  readonly rules: ScenarioDeploymentRules;
  readonly players: readonly DeploymentPlayerInput[];
  readonly units: readonly DeploymentUnitInput[];
  readonly territories: readonly DeploymentTerritoryInput[];
}): DeploymentInvariantAssessment {
  const { rules, players, units, territories } = input;
  const issues: DeploymentInvariantIssue[] = [];
  const warnings: DeploymentInvariantIssue[] = [];
  const knownTerritories = new Set(territories.map((territory) => territory.id));
  const deployedCountByPlayer: Record<PlayerId, number> = {};
  const baselineActivationCountByPlayer: Record<PlayerId, number> = {};
  const startingTerritorySlotCapacityByPlayer: Record<PlayerId, number> = {};
  const legalStartingDeploymentCapacityByPlayer: Record<PlayerId, number> = {};
  const cardGrantedDeploymentCapacityByPlayer: Record<PlayerId, number> = {};

  if (!Number.isInteger(rules.maxFriendlyUnitsPerTerritory) || rules.maxFriendlyUnitsPerTerritory < 1) {
    issues.push(issue("INVALID_TERRITORY_CAPACITY", "Friendly-unit territory capacity must be a positive integer."));
  }
  if (rules.actionEconomyException && !rules.exceptionReason?.trim()) {
    issues.push(issue("MISSING_ACTION_ECONOMY_EXCEPTION_REASON", "Action Economy Exceptions require an explicit reason."));
  }
  if (rules.standardDeployment && rules.actionEconomyException) {
    issues.push(issue("CONFLICTING_DEPLOYMENT_MODE", "A scenario cannot be both standard deployment and an Action Economy Exception."));
  }

  for (const player of players) {
    const playerUnits = units.filter((unit) => unit.ownerId === player.id);
    const startingTerritories = rules.startingTerritoryIdsByFaction[player.factionId] ?? [];
    const uniqueStartingTerritories = new Set<TerritoryId>();

    if (startingTerritories.length === 0) {
      issues.push(issue(
        "MISSING_STARTING_TERRITORIES",
        `Faction ${player.factionId} has no legal starting territories.`,
        player.id
      ));
    }

    for (const territoryId of startingTerritories) {
      if (!knownTerritories.has(territoryId)) {
        issues.push(issue(
          "UNKNOWN_STARTING_TERRITORY",
          `Starting territory ${territoryId} does not exist in this battlefield.`,
          player.id,
          territoryId
        ));
      }
      if (uniqueStartingTerritories.has(territoryId)) {
        issues.push(issue(
          "DUPLICATE_STARTING_TERRITORY",
          `Starting territory ${territoryId} is listed more than once.`,
          player.id,
          territoryId
        ));
      }
      uniqueStartingTerritories.add(territoryId);
    }

    const validBaseTerritories = [...uniqueStartingTerritories].filter((territoryId) => knownTerritories.has(territoryId));
    const baseSlotCapacity = validBaseTerritories.length * rules.maxFriendlyUnitsPerTerritory;
    startingTerritorySlotCapacityByPlayer[player.id] = baseSlotCapacity;

    const baseArmyCapacity = Math.min(playerUnits.length, baseSlotCapacity);
    const legalStartingCapacity = maxLegalStartingDeployment({
      units: playerUnits,
      baseTerritoryIds: validBaseTerritories,
      additionalTerritoryIdsByDefinition: rules.additionalStartingTerritoryIdsByUnitDefinition ?? {},
      knownTerritories,
      maxFriendlyUnitsPerTerritory: rules.maxFriendlyUnitsPerTerritory
    });
    legalStartingDeploymentCapacityByPlayer[player.id] = legalStartingCapacity;
    cardGrantedDeploymentCapacityByPlayer[player.id] = Math.max(0, legalStartingCapacity - baseArmyCapacity);

    const deployedUnits = playerUnits.filter((unit) => unit.territoryId !== null);
    const deployedCount = deployedUnits.length;
    deployedCountByPlayer[player.id] = deployedCount;
    baselineActivationCountByPlayer[player.id] = deployedCount;

    if (deployedCount > legalStartingCapacity) {
      issues.push(issue(
        "LEGAL_STARTING_CAPACITY_EXCEEDED",
        `Player ${player.id} starts with ${deployedCount} deployed units but only ${legalStartingCapacity} can be legally placed under the current scenario and card deployment rules.`,
        player.id
      ));
    }

    if (rules.standardDeployment && rules.deployToLegalCapacity && !rules.actionEconomyException && deployedCount < legalStartingCapacity) {
      issues.push(issue(
        "ACCIDENTAL_UNDER_DEPLOYMENT",
        `Player ${player.id} starts with ${deployedCount} deployed units but can legally deploy ${legalStartingCapacity}.`,
        player.id
      ));
    }

    for (const unit of deployedUnits) {
      if (unit.territoryId === null) continue;
      const legalStarts = legalStartingTerritoriesForUnit(
        unit,
        validBaseTerritories,
        rules.additionalStartingTerritoryIdsByUnitDefinition ?? {},
        knownTerritories
      );
      if (!legalStarts.has(unit.territoryId)) {
        issues.push(issue(
          "UNIT_OUTSIDE_LEGAL_STARTING_TERRITORY",
          `Unit ${unit.id} is deployed to ${unit.territoryId}, outside its legal scenario/card starting territories.`,
          player.id,
          unit.territoryId
        ));
      }
    }

    const countByTerritory = new Map<TerritoryId, number>();
    for (const unit of deployedUnits) {
      if (unit.territoryId === null) continue;
      const count = (countByTerritory.get(unit.territoryId) ?? 0) + 1;
      countByTerritory.set(unit.territoryId, count);
      if (count > rules.maxFriendlyUnitsPerTerritory) {
        issues.push(issue(
          "FRIENDLY_TERRITORY_CAPACITY_EXCEEDED",
          `Player ${player.id} has ${count} units on ${unit.territoryId}; limit is ${rules.maxFriendlyUnitsPerTerritory}.`,
          player.id,
          unit.territoryId
        ));
      }
    }
  }

  const baseCapacities = Object.values(startingTerritorySlotCapacityByPlayer);
  if (
    rules.standardDeployment &&
    baseCapacities.length > 1 &&
    new Set(baseCapacities).size > 1 &&
    !rules.actionEconomyException
  ) {
    issues.push(issue(
      "UNFLAGGED_ASYMMETRIC_STARTING_TERRITORY_CAPACITY",
      `Scenario starting-territory capacity is asymmetric (${baseCapacities.join(" vs ")}) without an Action Economy Exception.`
    ));
  }

  const deploymentCounts = Object.values(deployedCountByPlayer);
  if (deploymentCounts.length > 1 && new Set(deploymentCounts).size > 1) {
    warnings.push(issue(
      "UNEQUAL_STARTING_ACTION_ECONOMY",
      `Starting deployed-unit counts are unequal (${deploymentCounts.join(" vs ")}); record and analyze this as an opening action-economy difference.`
    ));
  }

  if (!rules.standardDeployment && !rules.actionEconomyException) {
    issues.push(issue(
      "NONSTANDARD_DEPLOYMENT_UNFLAGGED",
      "Non-standard deployment must be explicitly marked as an Action Economy Exception."
    ));
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
    deployedCountByPlayer,
    baselineActivationCountByPlayer,
    startingTerritorySlotCapacityByPlayer,
    legalStartingDeploymentCapacityByPlayer,
    cardGrantedDeploymentCapacityByPlayer
  };
}

export function assertDeploymentInvariant(input: Parameters<typeof assessDeploymentInvariant>[0]): DeploymentInvariantAssessment {
  const assessment = assessDeploymentInvariant(input);
  if (!assessment.ok) {
    const summary = assessment.issues.map((item) => `${item.code}: ${item.message}`).join(" | ");
    throw new Error(`Deployment invariant failed: ${summary}`);
  }
  return assessment;
}

function maxLegalStartingDeployment(input: {
  readonly units: readonly DeploymentUnitInput[];
  readonly baseTerritoryIds: readonly TerritoryId[];
  readonly additionalTerritoryIdsByDefinition: Readonly<Record<UnitDefinitionId, readonly TerritoryId[]>>;
  readonly knownTerritories: ReadonlySet<TerritoryId>;
  readonly maxFriendlyUnitsPerTerritory: number;
}): number {
  const slotTerritoryIds: TerritoryId[] = [];
  const allRelevantTerritories = new Set<TerritoryId>(input.baseTerritoryIds);
  for (const unit of input.units) {
    for (const territoryId of input.additionalTerritoryIdsByDefinition[unit.definitionId] ?? []) {
      if (input.knownTerritories.has(territoryId)) allRelevantTerritories.add(territoryId);
    }
  }
  for (const territoryId of allRelevantTerritories) {
    for (let index = 0; index < input.maxFriendlyUnitsPerTerritory; index += 1) {
      slotTerritoryIds.push(territoryId);
    }
  }

  const matchedUnitBySlot = new Map<number, UnitId>();
  const unitsById = new Map(input.units.map((unit) => [unit.id, unit]));

  const tryPlace = (unit: DeploymentUnitInput, visitedSlots: Set<number>): boolean => {
    const allowed = legalStartingTerritoriesForUnit(
      unit,
      input.baseTerritoryIds,
      input.additionalTerritoryIdsByDefinition,
      input.knownTerritories
    );
    for (let slotIndex = 0; slotIndex < slotTerritoryIds.length; slotIndex += 1) {
      if (visitedSlots.has(slotIndex) || !allowed.has(slotTerritoryIds[slotIndex]!)) continue;
      visitedSlots.add(slotIndex);
      const occupyingUnitId = matchedUnitBySlot.get(slotIndex);
      if (!occupyingUnitId) {
        matchedUnitBySlot.set(slotIndex, unit.id);
        return true;
      }
      const occupyingUnit = unitsById.get(occupyingUnitId);
      if (occupyingUnit && tryPlace(occupyingUnit, visitedSlots)) {
        matchedUnitBySlot.set(slotIndex, unit.id);
        return true;
      }
    }
    return false;
  };

  let matches = 0;
  for (const unit of input.units) {
    if (tryPlace(unit, new Set<number>())) matches += 1;
  }
  return matches;
}

function legalStartingTerritoriesForUnit(
  unit: DeploymentUnitInput,
  baseTerritoryIds: readonly TerritoryId[],
  additionalTerritoryIdsByDefinition: Readonly<Record<UnitDefinitionId, readonly TerritoryId[]>>,
  knownTerritories: ReadonlySet<TerritoryId>
): Set<TerritoryId> {
  const result = new Set<TerritoryId>(baseTerritoryIds.filter((territoryId) => knownTerritories.has(territoryId)));
  for (const territoryId of additionalTerritoryIdsByDefinition[unit.definitionId] ?? []) {
    if (knownTerritories.has(territoryId)) result.add(territoryId);
  }
  return result;
}

function issue(
  code: string,
  message: string,
  playerId?: PlayerId,
  territoryId?: TerritoryId
): DeploymentInvariantIssue {
  return { code, message, ...(playerId ? { playerId } : {}), ...(territoryId ? { territoryId } : {}) };
}

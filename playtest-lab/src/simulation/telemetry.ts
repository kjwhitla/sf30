import type { EngineAction } from "../engine/actions.js";
import type { GameState, PlayerId } from "../engine/types.js";
import type { PlayerPolicy } from "./policy.js";
import type { SimulationResult } from "./runner.js";

export interface PlayerMatchTelemetry {
  readonly playerId: PlayerId;
  readonly factionId: string;
  readonly policyId: string;
  readonly selectedActions: number;
  readonly acceptedActions: number;
  readonly startingTerritorySlotCapacity: number | null;
  readonly legalStartingDeploymentCapacity: number | null;
  readonly cardGrantedDeploymentCapacity: number | null;
  readonly actionEconomyException: boolean;
  readonly startingDeployedUnits: number;
  readonly startingActivationOpportunities: number;
  readonly startingTerritoryIds: readonly string[];
  readonly finalCommand: number;
  readonly finalVictoryPoints: number;
}

export interface MatchTelemetry {
  readonly schemaVersion: 5;
  readonly batchId: string;
  readonly matchId: string;
  readonly matchIndex: number;
  readonly seed: number;
  readonly gameId: string;
  readonly scenarioId: string | null;
  readonly stopReason: SimulationResult["stopReason"];
  readonly stepCount: number;
  readonly eventCount: number;
  readonly initialEventSequence: number;
  readonly finalEventSequence: number;
  readonly finalLifecycle: GameState["lifecycle"];
  readonly actionTypeCounts: Readonly<Record<string, number>>;
  readonly eventTypeCounts: Readonly<Record<string, number>>;
  readonly players: readonly PlayerMatchTelemetry[];
}

export interface MatchTelemetryInput<TAction extends EngineAction = EngineAction> {
  readonly batchId: string;
  readonly matchId: string;
  readonly matchIndex: number;
  readonly seed: number;
  readonly initialState: GameState;
  readonly policies: Readonly<Record<PlayerId, PlayerPolicy<TAction>>>;
  readonly result: SimulationResult<TAction>;
}

export function buildMatchTelemetry<TAction extends EngineAction>(
  input: MatchTelemetryInput<TAction>
): MatchTelemetry {
  const actionTypeCounts: Record<string, number> = {};
  const eventTypeCounts: Record<string, number> = {};
  const selectedByPlayer: Record<string, number> = {};
  const acceptedByPlayer: Record<string, number> = {};

  for (const step of input.result.steps) {
    if (step.action) {
      increment(actionTypeCounts, step.action.type);
      increment(selectedByPlayer, step.playerId);
      if (step.accepted) {
        increment(acceptedByPlayer, step.playerId);
      }
    }
  }

  for (const event of input.result.events) {
    increment(eventTypeCounts, event.type);
  }

  const players = Object.values(input.result.finalState.players)
    .map((player) => {
      const startingUnits = player.unitIds
        .map((unitId) => input.initialState.units[unitId])
        .filter((unit) => unit !== undefined && unit.territoryId !== null);
      const startingTerritoryIds = [...new Set(
        startingUnits
          .map((unit) => unit?.territoryId)
          .filter((territoryId): territoryId is string => territoryId !== null && territoryId !== undefined)
      )].sort();
      const deployment = input.initialState.scenario?.deployment ?? null;
      return {
        playerId: player.id,
        factionId: player.factionId,
        policyId: input.policies[player.id]?.id ?? "unconfigured",
        selectedActions: selectedByPlayer[player.id] ?? 0,
        acceptedActions: acceptedByPlayer[player.id] ?? 0,
        startingTerritorySlotCapacity: deployment?.startingTerritorySlotCapacityByPlayer[player.id] ?? null,
        legalStartingDeploymentCapacity: deployment?.legalStartingDeploymentCapacityByPlayer[player.id] ?? null,
        cardGrantedDeploymentCapacity: deployment?.cardGrantedDeploymentCapacityByPlayer[player.id] ?? null,
        actionEconomyException: deployment?.actionEconomyException ?? false,
        startingDeployedUnits: startingUnits.length,
        startingActivationOpportunities: startingUnits.filter((unit) => unit?.activation === "ready").length,
        startingTerritoryIds,
        finalCommand: player.command,
        finalVictoryPoints: player.victoryPoints
      };
    })
    .sort((a, b) => a.playerId.localeCompare(b.playerId));

  return {
    schemaVersion: 5,
    batchId: input.batchId,
    matchId: input.matchId,
    matchIndex: input.matchIndex,
    seed: input.seed,
    gameId: input.result.finalState.gameId,
    scenarioId: input.result.finalState.scenario?.id ?? null,
    stopReason: input.result.stopReason,
    stepCount: input.result.steps.length,
    eventCount: input.result.events.length,
    initialEventSequence: input.initialState.eventSequence,
    finalEventSequence: input.result.finalState.eventSequence,
    finalLifecycle: input.result.finalState.lifecycle,
    actionTypeCounts,
    eventTypeCounts,
    players
  };
}

export function serializeMatchTelemetryJsonl(
  matches: readonly MatchTelemetry[]
): string {
  return matches.map((match) => JSON.stringify(match)).join("\n");
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

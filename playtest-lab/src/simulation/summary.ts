import type { SimulationBatchResult } from "./batch.js";
import type { MatchTelemetry } from "./telemetry.js";

export interface FlatMatchSummaryRow {
  readonly batchId: string;
  readonly matchId: string;
  readonly matchIndex: number;
  readonly seed: number;
  readonly scenarioId: string | null;
  readonly stopReason: string;
  readonly stepCount: number;
  readonly eventCount: number;
  readonly playerId: string;
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
  readonly startingTerritoryIds: string;
  readonly finalCommand: number;
  readonly finalVictoryPoints: number;
}

/** Long-form rows: one row per player per match, ideal for CSV/Python. */
export function flattenMatchTelemetry(
  matches: readonly MatchTelemetry[]
): readonly FlatMatchSummaryRow[] {
  return matches.flatMap((match) =>
    match.players.map((player) => ({
      batchId: match.batchId,
      matchId: match.matchId,
      matchIndex: match.matchIndex,
      seed: match.seed,
      scenarioId: match.scenarioId,
      stopReason: match.stopReason,
      stepCount: match.stepCount,
      eventCount: match.eventCount,
      playerId: player.playerId,
      factionId: player.factionId,
      policyId: player.policyId,
      selectedActions: player.selectedActions,
      acceptedActions: player.acceptedActions,
      startingTerritorySlotCapacity: player.startingTerritorySlotCapacity,
      legalStartingDeploymentCapacity: player.legalStartingDeploymentCapacity,
      cardGrantedDeploymentCapacity: player.cardGrantedDeploymentCapacity,
      actionEconomyException: player.actionEconomyException,
      startingDeployedUnits: player.startingDeployedUnits,
      startingActivationOpportunities: player.startingActivationOpportunities,
      startingTerritoryIds: player.startingTerritoryIds.join("|"),
      finalCommand: player.finalCommand,
      finalVictoryPoints: player.finalVictoryPoints
    }))
  );
}

export function flattenBatchResult(
  batch: SimulationBatchResult
): readonly FlatMatchSummaryRow[] {
  return flattenMatchTelemetry(batch.matches.map((match) => match.telemetry));
}

export function serializeFlatSummaryCsv(
  rows: readonly FlatMatchSummaryRow[]
): string {
  const headers: readonly (keyof FlatMatchSummaryRow)[] = [
    "batchId",
    "matchId",
    "matchIndex",
    "seed",
    "scenarioId",
    "stopReason",
    "stepCount",
    "eventCount",
    "playerId",
    "factionId",
    "policyId",
    "selectedActions",
    "acceptedActions",
    "startingTerritorySlotCapacity",
    "legalStartingDeploymentCapacity",
    "cardGrantedDeploymentCapacity",
    "actionEconomyException",
    "startingDeployedUnits",
    "startingActivationOpportunities",
    "startingTerritoryIds",
    "finalCommand",
    "finalVictoryPoints"
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header])).join(","));
  }
  return lines.join("\n");
}

function csvCell(value: string | number | boolean | null): string {
  if (value === null) {
    return "";
  }
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

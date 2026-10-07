import type {
  GameState,
  PlayerId,
  TerritoryControlState,
  TerritoryId
} from "../engine/types.js";

export interface TerritoryObjectiveControlAssessment {
  readonly territoryId: TerritoryId;
  readonly objectiveControlByPlayer: Readonly<Record<PlayerId, number>>;
  readonly highestObjectiveControl: number;
  readonly leadingPlayerIds: readonly PlayerId[];
  readonly control: TerritoryControlState;
}

/**
 * Calculates the standard Objective Control state for one Territory.
 *
 * Source model:
 * - sum each player's current OC on the Territory,
 * - no positive OC -> Uncontrolled,
 * - equal positive opposing OC -> Contested,
 * - one strictly higher total -> Controlled by that player.
 *
 * This derives control only. It does not score VP, activate a Territory, or
 * apply scenario-specific overrides.
 */
export function assessTerritoryObjectiveControl(
  state: GameState,
  territoryId: TerritoryId
): TerritoryObjectiveControlAssessment {
  const territory = state.territories[territoryId];
  if (!territory) {
    throw new Error(`Unknown territory ${territoryId}.`);
  }

  const totals: Record<PlayerId, number> = Object.fromEntries(
    Object.keys(state.players).map((playerId) => [playerId, 0])
  );

  for (const unitId of territory.occupantUnitIds) {
    const unit = state.units[unitId];
    if (!unit || unit.territoryId !== territoryId || unit.currentHealth <= 0) {
      continue;
    }
    const objectiveControl = unit.currentObjectiveControl;
    if (objectiveControl === null || objectiveControl <= 0) {
      continue;
    }
    totals[unit.ownerId] = (totals[unit.ownerId] ?? 0) + objectiveControl;
  }

  const entries = Object.entries(totals) as [PlayerId, number][];
  const highestObjectiveControl = entries.reduce(
    (highest, [, total]) => Math.max(highest, total),
    0
  );
  const leadingPlayerIds = highestObjectiveControl > 0
    ? entries
        .filter(([, total]) => total === highestObjectiveControl)
        .map(([playerId]) => playerId)
        .sort()
    : [];

  let control: TerritoryControlState;
  if (highestObjectiveControl <= 0) {
    control = { kind: "uncontrolled", controlledBy: null };
  } else if (leadingPlayerIds.length === 1) {
    control = { kind: "controlled", controlledBy: leadingPlayerIds[0] ?? null };
  } else {
    control = { kind: "contested", controlledBy: null };
  }

  return {
    territoryId,
    objectiveControlByPlayer: totals,
    highestObjectiveControl,
    leadingPlayerIds,
    control
  };
}

/**
 * Rebuilds standard OC-derived control for every runtime Territory.
 *
 * This is intentionally a pure state derivation with no event/VP side effect.
 * Callers that support explicit scenario control overrides must apply those
 * overrides separately rather than treating this helper as scoring logic.
 */
export function recalculateStandardTerritoryControl(state: GameState): GameState {
  const territories = Object.fromEntries(
    Object.entries(state.territories).map(([territoryId, territory]) => {
      const assessment = assessTerritoryObjectiveControl(state, territoryId);
      return [territoryId, { ...territory, control: assessment.control }];
    })
  );

  return { ...state, territories };
}

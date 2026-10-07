import type { EngineAction, ResolutionResult, RuleError } from "../engine/actions.js";
import type { GameEvent } from "../engine/events.js";
import { assertStateInvariants } from "../engine/invariants.js";
import type {
  GameState,
  PlayerId,
  TerritoryId,
  UnitDefinition,
  UnitId
} from "../engine/types.js";
import { resolvePostActionPriority } from "./action-phase.js";
import { recalculateStandardTerritoryControl } from "./objective-control.js";

export type MoveAction = EngineAction<
  "unit.move",
  {
    readonly unitId: UnitId;
    readonly destinationTerritoryId: TerritoryId;
  }
>;

export type MoveAssessment =
  | { readonly status: "allowed"; readonly distance: number }
  | { readonly status: "blocked"; readonly errors: readonly RuleError[] }
  | { readonly status: "unresolved"; readonly errors: readonly RuleError[] };

const PLAYER_ZONE_UNIT_LIMIT = 3;

/**
 * Returns production-safe Move actions confirmed by the Live Working Version.
 * Owner ruling 2026-10-05: Vehicles can pass through an enemy-occupied
 * intermediate Territory during a legal 2-territory Move. Any special
 * consequence for doing so remains a separate review item.
 */
export function getLegalMoveActions(state: GameState, playerId: PlayerId): readonly MoveAction[] {
  const player = state.players[playerId];
  if (!player || state.lifecycle !== "active" || state.roundFlow?.phase !== "action") {
    return [];
  }
  if (state.roundFlow.priorityPlayerId !== null && state.roundFlow.priorityPlayerId !== playerId) {
    return [];
  }

  const actions: MoveAction[] = [];
  for (const unitId of player.unitIds) {
    for (const territoryId of state.battlefieldTerritoryIds) {
      const assessment = assessMove(state, playerId, unitId, territoryId);
      if (assessment.status !== "allowed") {
        continue;
      }
      actions.push({
        id: `unit.move:${unitId}:${territoryId}:${state.eventSequence}`,
        type: "unit.move",
        playerId,
        basedOnEventSequence: state.eventSequence,
        payload: {
          unitId,
          destinationTerritoryId: territoryId
        }
      });
    }
  }
  return actions;
}

export function assessMove(
  state: GameState,
  playerId: PlayerId,
  unitId: UnitId,
  destinationTerritoryId: TerritoryId
): MoveAssessment {
  const errors: RuleError[] = [];
  const player = state.players[playerId];
  const unit = state.units[unitId];
  const destination = state.territories[destinationTerritoryId];

  if (!player) {
    errors.push(ruleError("PLAYER_MISSING", `Player ${playerId} does not exist.`));
  }
  if (!unit) {
    errors.push(ruleError("UNIT_MISSING", `Unit ${unitId} does not exist.`));
  }
  if (!destination) {
    errors.push(ruleError("DESTINATION_MISSING", `Territory ${destinationTerritoryId} does not exist.`));
  }
  if (errors.length > 0 || !player || !unit || !destination) {
    return { status: "blocked", errors };
  }

  const flow = state.roundFlow;
  if (state.pendingMelee !== null) {
    errors.push(ruleError("MELEE_SEQUENCE_PENDING", "Another action cannot begin while a Melee sequence is awaiting resolution."));
  }
  if (state.lifecycle !== "active" || flow?.phase !== "action") {
    errors.push(ruleError("NOT_ACTION_PHASE", "Move is only legal during the Action Phase."));
  } else if (flow.priorityPlayerId !== null && flow.priorityPlayerId !== playerId) {
    errors.push(ruleError("NO_PRIORITY", `Player ${playerId} does not currently have activation priority.`));
  }
  if (unit.ownerId !== playerId) {
    errors.push(ruleError("NOT_UNIT_OWNER", `Player ${playerId} does not own unit ${unitId}.`));
  }
  if (unit.activation !== "ready") {
    errors.push(ruleError("UNIT_DEACTIVATED", `Unit ${unitId} is not ready to act.`));
  }
  if (unit.territoryId === null) {
    errors.push(ruleError("UNIT_OFF_FIELD", `Unit ${unitId} is not on the battlefield.`));
  }
  if (unit.territoryId === destinationTerritoryId) {
    errors.push(ruleError("SAME_TERRITORY", "A Move action must change territories."));
  }
  if (errors.length > 0 || unit.territoryId === null) {
    return { status: "blocked", errors };
  }

  const fromIndex = state.battlefieldTerritoryIds.indexOf(unit.territoryId);
  const toIndex = state.battlefieldTerritoryIds.indexOf(destinationTerritoryId);
  if (fromIndex < 0 || toIndex < 0) {
    return {
      status: "blocked",
      errors: [ruleError("BATTLEFIELD_ORDER_MISSING", "Move endpoints must exist in battlefield order.")]
    };
  }

  const definition = state.unitDefinitions[unit.definitionId];
  if (!definition) {
    return {
      status: "blocked",
      errors: [ruleError("UNIT_DEFINITION_MISSING", `Missing definition ${unit.definitionId}.`)]
    };
  }
  const maxDistance = unit.currentMovement;
  const distance = Math.abs(toIndex - fromIndex);
  const phaseShiftDestination =
    definition.id === "fatebound-warpers" &&
    destination.occupantUnitIds.some((occupantId) => state.units[occupantId]?.ownerId === playerId);
  if (distance < 1 || (distance > maxDistance && !phaseShiftDestination)) {
    return {
      status: "blocked",
      errors: [
        ruleError(
          "MOVE_DISTANCE_EXCEEDED",
          `${definition.unitClass} ${unitId} currently has MOVE ${maxDistance} and cannot reach ${destinationTerritoryId}.`
        )
      ]
    };
  }

  const ownUnitsAtDestination = destination.occupantUnitIds.filter(
    (occupantId) => state.units[occupantId]?.ownerId === playerId
  ).length;
  if (ownUnitsAtDestination >= PLAYER_ZONE_UNIT_LIMIT) {
    return {
      status: "blocked",
      errors: [
        ruleError(
          "PLAYER_ZONE_FULL",
          `Player ${playerId} already has ${PLAYER_ZONE_UNIT_LIMIT} units in ${destinationTerritoryId}.`
        )
      ]
    };
  }


  return { status: "allowed", distance };
}

/**
 * Resolve a canonical Move action after legality has been established.
 *
 * This mutates only sourced state: battlefield occupancy, the unit's Territory,
 * deactivation, derived standard OC/control, and Action Phase priority. It does
 * not invent any unresolved special consequence for a Vehicle passing through
 * an enemy-occupied intermediate Territory.
 */
export function applyMove(state: GameState, action: MoveAction): ResolutionResult {
  if (action.basedOnEventSequence !== state.eventSequence) {
    return rejected(
      state,
      ruleError(
        "STALE_ACTION",
        `Action was based on event sequence ${action.basedOnEventSequence}; current sequence is ${state.eventSequence}.`
      )
    );
  }

  const assessment = assessMove(
    state,
    action.playerId,
    action.payload.unitId,
    action.payload.destinationTerritoryId
  );
  if (assessment.status !== "allowed") {
    return rejected(
      state,
      assessment.errors[0] ?? ruleError("MOVE_BLOCKED", "Move is not legal.")
    );
  }

  const unit = state.units[action.payload.unitId];
  if (!unit || unit.territoryId === null) {
    return rejected(state, ruleError("UNIT_OFF_FIELD", `Unit ${action.payload.unitId} is not on the battlefield.`));
  }
  const sourceTerritory = state.territories[unit.territoryId];
  const destinationTerritory = state.territories[action.payload.destinationTerritoryId];
  if (!sourceTerritory || !destinationTerritory) {
    return rejected(state, ruleError("MOVE_ENDPOINT_MISSING", "Move endpoints must exist."));
  }

  const fromTerritoryId = unit.territoryId;
  const movedUnit = {
    ...unit,
    territoryId: action.payload.destinationTerritoryId,
    activation: "used" as const
  };
  const units = { ...state.units, [unit.id]: movedUnit };
  const territories = {
    ...state.territories,
    [fromTerritoryId]: {
      ...sourceTerritory,
      occupantUnitIds: sourceTerritory.occupantUnitIds.filter((id) => id !== unit.id)
    },
    [action.payload.destinationTerritoryId]: {
      ...destinationTerritory,
      occupantUnitIds: [...destinationTerritory.occupantUnitIds, unit.id]
    }
  };

  const occupancyState: GameState = { ...state, units, territories };
  const controlState = recalculateStandardTerritoryControl(occupancyState);
  const priorityResolution = resolvePostActionPriority(controlState, action.playerId);

  const moveSequence = state.eventSequence + 1;
  const events: GameEvent[] = [
    {
      gameId: state.gameId,
      sequence: moveSequence,
      type: "unit.moved",
      actorId: action.playerId,
      payload: {
        unitId: unit.id,
        fromTerritoryId,
        toTerritoryId: action.payload.destinationTerritoryId,
        distance: assessment.distance
      }
    } satisfies GameEvent<
      "unit.moved",
      {
        readonly unitId: UnitId;
        readonly fromTerritoryId: TerritoryId;
        readonly toTerritoryId: TerritoryId;
        readonly distance: number;
      }
    >
  ];

  if (priorityResolution.actionPhaseEnded) {
    events.push({
      gameId: state.gameId,
      sequence: moveSequence + 1,
      type: "phase.end-round.started",
      actorId: null,
      payload: { round: priorityResolution.roundFlow.round }
    });
  }

  const finalSequence = events[events.length - 1]?.sequence ?? moveSequence;
  const nextState: GameState = {
    ...controlState,
    roundFlow: priorityResolution.roundFlow,
    scenario: priorityResolution.actionPhaseEnded && state.scenario
      ? { ...state.scenario, round: priorityResolution.roundFlow.round, phase: "end-round" }
      : state.scenario,
    eventSequence: finalSequence
  };
  assertStateInvariants(nextState);
  return { accepted: true, nextState, events };
}

function rejected(state: GameState, error: RuleError): ResolutionResult {
  return { accepted: false, nextState: state, events: [], error };
}

export function getBaseMoveDistance(definition: UnitDefinition): number {
  return definition.unitClass.trim().toUpperCase() === "VEHICLE" ? 2 : 1;
}

function ruleError(code: string, message: string): RuleError {
  return { code, message };
}

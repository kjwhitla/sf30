import type { RuleError } from "../engine/actions.js";
import { getLegalDigInActions, type DigInAction } from "./dig-in.js";
import { getLegalUnitAbilityActions, type UnitAbilityAction } from "./abilities.js";
import { getLegalChargeActions, type ChargeAction } from "./charge.js";
import type { GameState, PlayerId, TerritoryId, UnitId } from "../engine/types.js";
import { getLegalMeleeActions, type MeleeAction } from "./melee.js";
import { getLegalMoveActions, type MoveAction } from "./movement.js";
import {
  getLegalShootActions,
  type ShootAction,
  type ShootModifierResolver
} from "./shooting.js";

export type ProjectedUnitAction = MoveAction | ShootAction | MeleeAction | ChargeAction | DigInAction | UnitAbilityAction;
export type ProjectedUnitActionType = ProjectedUnitAction["type"];

export type UnitSelectionAssessment =
  | { readonly status: "selectable" }
  | { readonly status: "blocked"; readonly errors: readonly RuleError[] };

export interface UnitLegalOptionProjection {
  readonly playerId: PlayerId;
  readonly unitId: UnitId;
  readonly selectable: boolean;
  readonly selectionErrors: readonly RuleError[];
  /**
   * Canonical engine actions. UI, agents, accessibility controls, and replay
   * should choose from these rather than recreating legality independently.
   *
   * Current coverage is intentionally limited to action families whose
   * production-safe legality is executable today: Move, Shoot, Melee, Charge, Dig In, and sourced Action Abilities.
   */
  readonly legalActions: readonly ProjectedUnitAction[];
  readonly legalActionTypes: readonly ProjectedUnitActionType[];
  readonly move: {
    readonly destinationTerritoryIds: readonly TerritoryId[];
    readonly actions: readonly MoveAction[];
  };
  readonly shoot: {
    readonly targetUnitIds: readonly UnitId[];
    readonly actions: readonly ShootAction[];
  };
  readonly melee: {
    readonly targetUnitIds: readonly UnitId[];
    readonly actions: readonly MeleeAction[];
  };
  readonly charge: {
    readonly targetUnitIds: readonly UnitId[];
    readonly actions: readonly ChargeAction[];
  };
  readonly digIn: {
    readonly actions: readonly DigInAction[];
  };
  readonly ability: {
    readonly targetUnitIds: readonly UnitId[];
    readonly actions: readonly UnitAbilityAction[];
  };
}

/**
 * Rules-derived unit-selection assessment for the Action Phase.
 *
 * This does not imply that every action family is already implemented. It only
 * answers whether the unit itself is eligible to be the active unit under the
 * sourced one-unit-at-a-time activation flow.
 */
export function assessUnitSelection(
  state: GameState,
  playerId: PlayerId,
  unitId: UnitId
): UnitSelectionAssessment {
  const errors: RuleError[] = [];
  const player = state.players[playerId];
  const unit = state.units[unitId];

  if (!player) errors.push(ruleError("PLAYER_MISSING", `Player ${playerId} does not exist.`));
  if (!unit) errors.push(ruleError("UNIT_MISSING", `Unit ${unitId} does not exist.`));
  if (errors.length > 0 || !player || !unit) return { status: "blocked", errors };

  const flow = state.roundFlow;
  if (state.pendingMelee !== null) {
    errors.push(ruleError("MELEE_SEQUENCE_PENDING", "Unit selection is locked while a Melee sequence is awaiting resolution."));
  }
  if (state.lifecycle !== "active" || flow?.phase !== "action") {
    errors.push(ruleError("NOT_ACTION_PHASE", "Units may only be selected for activation during the Action Phase."));
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

  return errors.length > 0 ? { status: "blocked", errors } : { status: "selectable" };
}

/** Return units eligible for the sourced "select one active unit" Action Phase step. */
export function getSelectableUnitIds(state: GameState, playerId: PlayerId): readonly UnitId[] {
  const player = state.players[playerId];
  if (!player) return [];
  return player.unitIds.filter(
    (unitId) => assessUnitSelection(state, playerId, unitId).status === "selectable"
  );
}

/**
 * Project the legal options for one selected unit using the same canonical
 * Move/Shoot/Melee/Charge/Dig In/Action Ability generators used by rules consumers.
 *
 * This is deliberately not a UI gesture model and deliberately does not invent
 * PING or Load/Unload legality before those action families have executable sourced rules.
 */
export function projectUnitLegalOptions(
  state: GameState,
  playerId: PlayerId,
  unitId: UnitId,
  resolveShootModifiers: ShootModifierResolver
): UnitLegalOptionProjection {
  const selection = assessUnitSelection(state, playerId, unitId);
  const selectionErrors = selection.status === "blocked" ? selection.errors : [];

  if (selection.status === "blocked") {
    return emptyProjection(playerId, unitId, selectionErrors);
  }

  const moveActions = getLegalMoveActions(state, playerId).filter(
    (action) => action.payload.unitId === unitId
  );
  const shootActions = getLegalShootActions(state, playerId, resolveShootModifiers).filter(
    (action) => action.payload.attackerUnitId === unitId
  );
  const meleeActions = getLegalMeleeActions(state, playerId).filter(
    (action) => action.payload.attackerUnitId === unitId
  );
  const chargeActions = getLegalChargeActions(state, playerId).filter(
    (action) => action.payload.attackerUnitId === unitId
  );
  const digInActions = getLegalDigInActions(state, playerId).filter(
    (action) => action.payload.unitId === unitId
  );
  const abilityActions = getLegalUnitAbilityActions(state, playerId).filter(
    (action) => action.payload.unitId === unitId
  );

  const legalActions: ProjectedUnitAction[] = [
    ...moveActions,
    ...shootActions,
    ...meleeActions,
    ...chargeActions,
    ...digInActions,
    ...abilityActions
  ];
  const legalActionTypes = [
    ...(moveActions.length > 0 ? (["unit.move"] as const) : []),
    ...(shootActions.length > 0 ? (["unit.shoot"] as const) : []),
    ...(meleeActions.length > 0 ? (["unit.melee"] as const) : []),
    ...(chargeActions.length > 0 ? (["unit.charge"] as const) : []),
    ...(digInActions.length > 0 ? (["unit.dig-in"] as const) : []),
    ...(abilityActions.length > 0 ? (["unit.ability"] as const) : [])
  ];

  return {
    playerId,
    unitId,
    selectable: true,
    selectionErrors: [],
    legalActions,
    legalActionTypes,
    move: {
      destinationTerritoryIds: moveActions.map((action) => action.payload.destinationTerritoryId),
      actions: moveActions
    },
    shoot: {
      targetUnitIds: shootActions.map((action) => action.payload.targetUnitId),
      actions: shootActions
    },
    melee: {
      targetUnitIds: meleeActions.map((action) => action.payload.targetUnitId),
      actions: meleeActions
    },
    charge: {
      targetUnitIds: chargeActions.map((action) => action.payload.targetUnitId),
      actions: chargeActions
    },
    digIn: { actions: digInActions },
    ability: {
      targetUnitIds: abilityActions.map((action) => action.payload.targetUnitId),
      actions: abilityActions
    }
  };
}

function emptyProjection(
  playerId: PlayerId,
  unitId: UnitId,
  selectionErrors: readonly RuleError[]
): UnitLegalOptionProjection {
  return {
    playerId,
    unitId,
    selectable: false,
    selectionErrors,
    legalActions: [],
    legalActionTypes: [],
    move: { destinationTerritoryIds: [], actions: [] },
    shoot: { targetUnitIds: [], actions: [] },
    melee: { targetUnitIds: [], actions: [] },
    charge: { targetUnitIds: [], actions: [] },
    digIn: { actions: [] },
    ability: { targetUnitIds: [], actions: [] }
  };
}

function ruleError(code: string, message: string): RuleError {
  return { code, message };
}

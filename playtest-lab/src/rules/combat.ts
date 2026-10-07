import type { RuleError } from "../engine/actions.js";
import type { GameState, PlayerId, UnitId, UnitState } from "../engine/types.js";
import { recalculateStandardTerritoryControl } from "./objective-control.js";
import { recalculateUnitState } from "./stats.js";

export type OffFieldZone = "reserves" | "destroyed";

export interface DestructionApplication {
  readonly status: "applied";
  readonly nextState: GameState;
  readonly targetUnit: UnitState;
  readonly offFieldZone: OffFieldZone;
  readonly victoryPointsAwarded: number;
  readonly onDeathCommandGained: number;
}

export interface CombatDamageApplication {
  readonly status: "applied";
  readonly nextState: GameState;
  readonly targetUnit: UnitState;
  readonly damage: number;
  readonly destroyed: boolean;
  readonly offFieldZone: OffFieldZone | null;
  readonly victoryPointsAwarded: number;
  readonly onDeathCommandGained: number;
}

export interface CombatDamageBlocked {
  readonly status: "unresolved";
  readonly errors: readonly RuleError[];
}

type AutomaticOnDeathAssessment =
  | { readonly status: "none"; readonly commandGain: 0 }
  | { readonly status: "automatic"; readonly commandGain: number }
  | { readonly status: "unresolved"; readonly commandGain: 0 };

/**
 * Promote only the exact no-choice On-Death form currently supported by the
 * sourced roster: `Gain N CP`. Engine terminology is Command/CMD and the
 * canonical Command cap of 3 still applies. All other On-Death prose remains
 * fail-closed rather than being interpreted heuristically.
 */
export function assessAutomaticOnDeath(onDeathText: string | null): AutomaticOnDeathAssessment {
  const text = onDeathText?.trim() ?? "";
  if (text.length === 0) return { status: "none", commandGain: 0 };
  const gain = /^Gain\s*\+?(\d+)\s*CP$/i.exec(text);
  if (gain) return { status: "automatic", commandGain: Number(gain[1]) };
  return { status: "unresolved", commandGain: 0 };
}

/**
 * Apply already-resolved combat damage to state.
 *
 * Nonlethal wounds always apply. Lethal damage is executable when destroyed VP
 * is sourced and the target has either no On-Death effect or the exact
 * no-choice `Gain N CP` effect supported above. Other On-Death branches remain
 * fail-closed so the engine never silently skips a card effect.
 */
export function applyResolvedCombatDamage(
  state: GameState,
  attackingPlayerId: PlayerId,
  targetUnitId: UnitId,
  damage: number
): CombatDamageApplication | CombatDamageBlocked {
  const target = state.units[targetUnitId];
  if (!target) return unresolved("TARGET_MISSING", `Unit ${targetUnitId} does not exist.`);
  if (!Number.isInteger(damage) || damage < 0) {
    return unresolved("DAMAGE_INVALID", `Combat damage must be a non-negative integer; received ${String(damage)}.`);
  }
  const definition = state.unitDefinitions[target.definitionId];
  if (!definition) return unresolved("UNIT_DEFINITION_MISSING", `Missing definition ${target.definitionId}.`);

  const nextWounds = target.wounds + damage;
  const wouldDestroy = nextWounds >= definition.stats.health;
  if (wouldDestroy && !canResolveBaseDestruction(state, targetUnitId)) {
    return unresolvedDestruction(state, targetUnitId);
  }

  const woundedBase = { ...target, wounds: nextWounds };
  const recalculated = recalculateUnitState(definition, woundedBase, target.temporaryStatModifiers);
  const woundedState: GameState = {
    ...state,
    units: { ...state.units, [targetUnitId]: recalculated }
  };

  if (!wouldDestroy) {
    return {
      status: "applied",
      nextState: recalculateStandardTerritoryControl(woundedState),
      targetUnit: recalculated,
      damage,
      destroyed: false,
      offFieldZone: null,
      victoryPointsAwarded: 0,
      onDeathCommandGained: 0
    };
  }

  const destruction = applyResolvedDestruction(woundedState, attackingPlayerId, targetUnitId);
  if (destruction.status !== "applied") return destruction;
  return {
    status: "applied",
    nextState: destruction.nextState,
    targetUnit: destruction.targetUnit,
    damage,
    destroyed: true,
    offFieldZone: destruction.offFieldZone,
    victoryPointsAwarded: destruction.victoryPointsAwarded,
    onDeathCommandGained: destruction.onDeathCommandGained
  };
}

/**
 * Resolve a rule-caused destruction that is not itself damage (for example, a
 * Retreat with no legal placement). This uses the same sourced Troop/Non-Troop
 * destination, printed/default destroyed VP, and executable On-Death handling
 * as combat damage without fabricating extra wound tokens.
 */
export function applyResolvedDestruction(
  state: GameState,
  attackingPlayerId: PlayerId,
  targetUnitId: UnitId
): DestructionApplication | CombatDamageBlocked {
  const target = state.units[targetUnitId];
  if (!target) return unresolved("TARGET_MISSING", `Unit ${targetUnitId} does not exist.`);
  const definition = state.unitDefinitions[target.definitionId];
  if (!definition) return unresolved("UNIT_DEFINITION_MISSING", `Missing definition ${target.definitionId}.`);
  if (!canResolveBaseDestruction(state, targetUnitId)) return unresolvedDestruction(state, targetUnitId);

  const offFieldZone: OffFieldZone = definition.unitClass.trim().toUpperCase() === "TROOP" ? "reserves" : "destroyed";
  const sourceTerritoryId = target.territoryId;
  const removed: UnitState = {
    ...target,
    territoryId: null,
    activation: "used",
    offFieldZone
  };

  let territories = state.territories;
  if (sourceTerritoryId !== null) {
    const territory = state.territories[sourceTerritoryId];
    if (territory) {
      territories = {
        ...territories,
        [sourceTerritoryId]: {
          ...territory,
          occupantUnitIds: territory.occupantUnitIds.filter((id) => id !== targetUnitId)
        }
      };
    }
  }

  let players = state.players;
  const victoryPointsAwarded = definition.destroyedVictoryPoints ?? 0;
  const attacker = players[attackingPlayerId];
  if (attacker && victoryPointsAwarded > 0) {
    players = {
      ...players,
      [attackingPlayerId]: {
        ...attacker,
        victoryPoints: attacker.victoryPoints + victoryPointsAwarded
      }
    };
  }

  let onDeathCommandGained = 0;
  const automaticOnDeath = assessAutomaticOnDeath(definition.onDeathText);
  if (automaticOnDeath.status === "automatic" && automaticOnDeath.commandGain > 0) {
    const owner = players[target.ownerId];
    if (owner) {
      const nextCommand = Math.min(3, owner.command + automaticOnDeath.commandGain);
      onDeathCommandGained = nextCommand - owner.command;
      players = {
        ...players,
        [target.ownerId]: { ...owner, command: nextCommand }
      };
    }
  }

  const units = { ...state.units, [targetUnitId]: removed };
  const nextState = recalculateStandardTerritoryControl({ ...state, units, territories, players });
  return {
    status: "applied",
    nextState,
    targetUnit: removed,
    offFieldZone,
    victoryPointsAwarded,
    onDeathCommandGained
  };
}

export function canResolveBaseDestruction(state: GameState, targetUnitId: UnitId): boolean {
  const target = state.units[targetUnitId];
  if (!target) return false;
  const definition = state.unitDefinitions[target.definitionId];
  if (!definition) return false;
  const onDeath = assessAutomaticOnDeath(definition.onDeathText);
  return onDeath.status !== "unresolved" && Number.isInteger(definition.destroyedVictoryPoints) && (definition.destroyedVictoryPoints ?? -1) >= 0;
}

/** True when a resolved attack value could kill the target on a zero Defense roll. */
export function attackCanReachLethalDamage(state: GameState, targetUnitId: UnitId, attackValue: number): boolean {
  const target = state.units[targetUnitId];
  if (!target) return false;
  return attackValue >= Math.max(0, target.currentHealth);
}

function unresolvedDestruction(state: GameState, targetUnitId: UnitId): CombatDamageBlocked {
  const target = state.units[targetUnitId];
  const definition = target ? state.unitDefinitions[target.definitionId] : undefined;
  if (!target) return unresolved("TARGET_MISSING", `Unit ${targetUnitId} does not exist.`);
  if (!definition) return unresolved("UNIT_DEFINITION_MISSING", `Missing definition ${target.definitionId}.`);
  const onDeath = assessAutomaticOnDeath(definition.onDeathText);
  if (onDeath.status === "unresolved") {
    return unresolved("ON_DEATH_UNRESOLVED", `Destruction of ${targetUnitId} would trigger an On-Death effect that is not yet executable.`);
  }
  return unresolved(
    "DESTROYED_VP_UNRESOLVED",
    `Destruction of ${targetUnitId} cannot resolve until its destroyed VP value is explicitly sourced.`
  );
}

function unresolved(code: string, message: string): CombatDamageBlocked {
  return { status: "unresolved", errors: [{ code, message }] };
}

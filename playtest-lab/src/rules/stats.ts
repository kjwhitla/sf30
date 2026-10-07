import type {
  GameState,
  UnitDefinition,
  UnitId,
  UnitState,
  UnitStatKey,
  UnitStatModifier
} from "../engine/types.js";

export type UnitModifierResolver = (input: {
  readonly state: GameState;
  readonly unitId: UnitId;
}) => readonly UnitStatModifier[];

/**
 * Rebuild a unit's effective values from authored stats + persistent wounds +
 * currently valid temporary/contextual modifiers.
 *
 * Temporary tokens/action benefits clear at the sourced Command Phase Update
 * Tokens step; wounds persist; contextual benefits are recalculated because
 * position and other sources may have changed.
 *
 * Live Working Version: each -1 wound token reduces HEALTH, SHOOT, MELEE, and
 * DEFENSE by 1; OC is not reduced by wounds. Non-null stats other than Health
 * have a minimum of 1.
 */
export function recalculateUnitState(
  definition: UnitDefinition,
  unit: UnitState,
  temporaryStatModifiers: readonly UnitStatModifier[]
): UnitState {
  assertWounds(unit.wounds);
  for (const modifier of temporaryStatModifiers) {
    if (!Number.isFinite(modifier.amount)) {
      throw new Error(`Modifier ${modifier.id} has non-finite amount ${String(modifier.amount)}.`);
    }
  }

  const woundPenalty = unit.wounds;
  return {
    ...unit,
    temporaryStatModifiers: [...temporaryStatModifiers],
    currentHealth:
      definition.stats.health - woundPenalty + modifierTotal(temporaryStatModifiers, "health"),
    currentShoot: recalcNullable(
      definition.stats.shoot,
      -woundPenalty + modifierTotal(temporaryStatModifiers, "shoot")
    ),
    currentMelee: recalcNullable(
      definition.stats.melee,
      -woundPenalty + modifierTotal(temporaryStatModifiers, "melee")
    ),
    currentDefense: recalcNullable(
      definition.stats.defense,
      -woundPenalty + modifierTotal(temporaryStatModifiers, "defense")
    ),
    currentObjectiveControl: recalcNullable(
      definition.stats.objectiveControl,
      modifierTotal(temporaryStatModifiers, "objectiveControl")
    ),
    currentMovement: Math.max(
      1,
      definition.stats.movement + modifierTotal(temporaryStatModifiers, "movement")
    )
  };
}

/** Recalculate one unit from its current match context. */
export function recalculateUnitInState(
  state: GameState,
  unitId: UnitId,
  resolveModifiers: UnitModifierResolver
): UnitState {
  const unit = state.units[unitId];
  if (!unit) throw new Error(`Unknown unit ${unitId}.`);
  const definition = state.unitDefinitions[unit.definitionId];
  if (!definition) throw new Error(`Missing definition ${unit.definitionId} for unit ${unitId}.`);
  return recalculateUnitState(definition, unit, resolveModifiers({ state, unitId }));
}

/**
 * Clear expired temporary values at Update Tokens and rebuild every unit from
 * its current location/context. The resolver is intentionally injected: Territory,
 * ability, scenario, and token systems can contribute modifiers without this
 * module inventing their rules.
 */
export function recalculateAllUnitStats(
  state: GameState,
  resolveModifiers: UnitModifierResolver
): Readonly<Record<UnitId, UnitState>> {
  return Object.fromEntries(
    Object.keys(state.units).map((unitId) => [
      unitId,
      recalculateUnitInState(state, unitId, resolveModifiers)
    ])
  );
}

export const NO_UNIT_MODIFIERS: UnitModifierResolver = () => [];

function recalcNullable(base: number | null, delta: number): number | null {
  if (base === null) return null;
  return Math.max(1, base + delta);
}

function modifierTotal(modifiers: readonly UnitStatModifier[], stat: UnitStatKey): number {
  return modifiers
    .filter((modifier) => modifier.stat === stat)
    .reduce((total, modifier) => total + modifier.amount, 0);
}

function assertWounds(wounds: number): void {
  if (!Number.isInteger(wounds) || wounds < 0) {
    throw new Error(`wounds must be a non-negative integer; received ${String(wounds)}.`);
  }
}

import type { EngineAction, ResolutionResult, RuleError } from "../engine/actions.js";
import type { RandomSource } from "../engine/rng.js";
import type { GameEvent } from "../engine/events.js";
import { assertStateInvariants } from "../engine/invariants.js";
import type { GameState, PlayerId, UnitId } from "../engine/types.js";
import { rollDefense, type FateRoll } from "./dice.js";
import { resolvePostActionPriority } from "./action-phase.js";
import { applyResolvedCombatDamage, attackCanReachLethalDamage, canResolveBaseDestruction } from "./combat.js";

export type ShootAction = EngineAction<
  "unit.shoot",
  {
    readonly attackerUnitId: UnitId;
    readonly targetUnitId: UnitId;
  }
>;

export type AttackModifierSource = "environment" | "action" | "token" | "ability" | "territory" | "other";

export interface AttackModifier {
  readonly id: string;
  readonly amount: number;
  readonly source: AttackModifierSource;
  readonly label?: string;
}

export interface ShootModifierContext {
  /** All modifiers applicable to this specific attacker/target Shoot declaration. */
  readonly attackModifiers: readonly AttackModifier[];
}

export type ShootModifierResolver = (input: {
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly attackerUnitId: UnitId;
  readonly targetUnitId: UnitId;
}) => ShootModifierContext;

export type ShootAssessment =
  | {
      readonly status: "allowed";
      readonly distance: number;
      readonly baseAttackValue: number;
      readonly modifierTotal: number;
      readonly attackModifiers: readonly AttackModifier[];
      readonly attackValue: number;
    }
  | { readonly status: "blocked"; readonly errors: readonly RuleError[] }
  | { readonly status: "unresolved"; readonly errors: readonly RuleError[] };

export type ShootDefenseResolution =
  | {
      readonly status: "resolved";
      readonly attackValue: number;
      readonly defenseRoll: FateRoll;
      readonly defenseRollAttempts: readonly FateRoll[];
      readonly damage: number;
    }
  | {
      readonly status: "unresolved";
      readonly attackValue: number;
      readonly defenseRoll: FateRoll | null;
      readonly defenseRollAttempts?: readonly FateRoll[];
      readonly errors: readonly RuleError[];
    };

/**
 * Production-safe Shoot actions from the Live Working Version.
 *
 * Callers must provide the complete modifier context for each target because
 * environment, actions, tokens, abilities, and territories may alter ATTACK.
 * Final ATTACK=0 is intentionally withheld pending RG-003A.
 */
export function getLegalShootActions(
  state: GameState,
  playerId: PlayerId,
  resolveModifiers: ShootModifierResolver
): readonly ShootAction[] {
  const player = state.players[playerId];
  if (!player || state.lifecycle !== "active" || state.roundFlow?.phase !== "action") {
    return [];
  }
  if (state.roundFlow.priorityPlayerId !== null && state.roundFlow.priorityPlayerId !== playerId) {
    return [];
  }

  const actions: ShootAction[] = [];
  for (const attackerUnitId of player.unitIds) {
    for (const target of Object.values(state.units)) {
      if (target.ownerId === playerId) {
        continue;
      }
      const assessment = assessShoot(
        state,
        playerId,
        attackerUnitId,
        target.id,
        resolveModifiers({ state, playerId, attackerUnitId, targetUnitId: target.id })
      );
      if (assessment.status !== "allowed") {
        continue;
      }
      actions.push({
        id: `unit.shoot:${attackerUnitId}:${target.id}:${state.eventSequence}`,
        type: "unit.shoot",
        playerId,
        basedOnEventSequence: state.eventSequence,
        payload: { attackerUnitId, targetUnitId: target.id }
      });
    }
  }
  return actions;
}

export function assessShoot(
  state: GameState,
  playerId: PlayerId,
  attackerUnitId: UnitId,
  targetUnitId: UnitId,
  modifierContext: ShootModifierContext
): ShootAssessment {
  const errors: RuleError[] = [];
  const player = state.players[playerId];
  const attacker = state.units[attackerUnitId];
  const target = state.units[targetUnitId];

  if (!player) errors.push(ruleError("PLAYER_MISSING", `Player ${playerId} does not exist.`));
  if (!attacker) errors.push(ruleError("ATTACKER_MISSING", `Unit ${attackerUnitId} does not exist.`));
  if (!target) errors.push(ruleError("TARGET_MISSING", `Unit ${targetUnitId} does not exist.`));
  if (errors.length > 0 || !player || !attacker || !target) return { status: "blocked", errors };

  const flow = state.roundFlow;
  if (state.pendingMelee !== null) {
    errors.push(ruleError("MELEE_SEQUENCE_PENDING", "Another action cannot begin while a Melee sequence is awaiting resolution."));
  }
  if (state.lifecycle !== "active" || flow?.phase !== "action") {
    errors.push(ruleError("NOT_ACTION_PHASE", "Shoot is only legal during the Action Phase."));
  } else if (flow.priorityPlayerId !== null && flow.priorityPlayerId !== playerId) {
    errors.push(ruleError("NO_PRIORITY", `Player ${playerId} does not currently have activation priority.`));
  }
  if (attacker.ownerId !== playerId) errors.push(ruleError("NOT_UNIT_OWNER", `Player ${playerId} does not own unit ${attackerUnitId}.`));
  if (target.ownerId === playerId) errors.push(ruleError("FRIENDLY_TARGET", "Shoot must target an enemy unit."));
  if (attacker.activation !== "ready") errors.push(ruleError("UNIT_DEACTIVATED", `Unit ${attackerUnitId} is not ready to act.`));
  if (attacker.territoryId === null) errors.push(ruleError("ATTACKER_OFF_FIELD", `Unit ${attackerUnitId} is not on the battlefield.`));
  if (target.territoryId === null) errors.push(ruleError("TARGET_OFF_FIELD", `Unit ${targetUnitId} is not on the battlefield.`));
  if (attacker.currentShoot === null) errors.push(ruleError("SHOOT_STAT_NULL", `Unit ${attackerUnitId} does not operate with a SHOOT stat.`));
  if (errors.length > 0 || attacker.territoryId === null || target.territoryId === null || attacker.currentShoot === null) {
    return { status: "blocked", errors };
  }

  const fromIndex = state.battlefieldTerritoryIds.indexOf(attacker.territoryId);
  const toIndex = state.battlefieldTerritoryIds.indexOf(target.territoryId);
  if (fromIndex < 0 || toIndex < 0) {
    return { status: "blocked", errors: [ruleError("BATTLEFIELD_ORDER_MISSING", "Shoot endpoints must exist in battlefield order.")] };
  }

  const distance = Math.abs(toIndex - fromIndex);
  const targetRestriction = assessSourcedShootTargetRestriction(state, targetUnitId, distance);
  if (targetRestriction) {
    return { status: "blocked", errors: [targetRestriction] };
  }

  const baseAttackValue = attacker.currentShoot - distance;
  const attackModifiers = modifierContext.attackModifiers;
  const modifierTotal = attackModifiers.reduce((sum, modifier) => sum + modifier.amount, 0);
  const attackValue = baseAttackValue + modifierTotal;
  if (attackValue < 0) {
    return {
      status: "blocked",
      errors: [
        ruleError(
          "TARGET_OUT_OF_RANGE",
          `SHOOT ${attacker.currentShoot} - distance ${distance} + modifiers ${modifierTotal} produces final ATTACK ${attackValue}.`
        )
      ]
    };
  }
  if (attackValue === 0) {
    return {
      status: "unresolved",
      errors: [ruleError("RG-003A_ATTACK_ZERO", "Live Working Version does not state whether a target is legal when final modified ATTACK = 0.")]
    };
  }

  return { status: "allowed", distance, baseAttackValue, modifierTotal, attackModifiers, attackValue };
}


/**
 * Executable target restrictions that are stated unambiguously on the current
 * Live Stats experimental-v2 unit cards. Keep this deliberately narrow: card
 * abilities with unresolved timing, choices, or extra resolution remain
 * descriptive/non-executable until separately promoted.
 */
export function assessSourcedShootTargetRestriction(
  state: GameState,
  targetUnitId: UnitId,
  distance: number
): RuleError | null {
  const target = state.units[targetUnitId];
  if (!target) return ruleError("TARGET_MISSING", `Unit ${targetUnitId} does not exist.`);

  if (target.definitionId === "fatebound-spikemites") {
    return ruleError(
      "SHOOT_TARGET_IMMUNE",
      "Spikemites cannot be targeted by SHOOT actions."
    );
  }

  if (target.definitionId === "fatebound-the-hallowed" && distance > 1) {
    return ruleError(
      "SHOOT_TARGET_RANGE_RESTRICTED",
      "The Hallowed can only be targeted by enemy units in the same or an adjacent Territory."
    );
  }

  return null;
}

/**
 * Resolves the sourced defense roll and damage formula without mutating state.
 * Owner ruling 2026-10-05: Defense can exceed Attack; the Shoot still happens
 * and damage floors at 0.
 */
export function resolveShootDefense(
  state: GameState,
  assessment: Extract<ShootAssessment, { readonly status: "allowed" }>,
  targetUnitId: UnitId,
  rng: RandomSource,
  attackerUnitId?: UnitId
): ShootDefenseResolution {
  const target = state.units[targetUnitId];
  if (!target) {
    return { status: "unresolved", attackValue: assessment.attackValue, defenseRoll: null, errors: [ruleError("TARGET_MISSING", `Unit ${targetUnitId} does not exist.`)] };
  }
  if (target.currentDefense === null) {
    return {
      status: "unresolved",
      attackValue: assessment.attackValue,
      defenseRoll: null,
      errors: [ruleError("RG-003C_NULL_DEFENSE", "Live Working Version defines null stats but does not explicitly state whether null DEFENSE rolls zero dice.")]
    };
  }

  const attacker = attackerUnitId ? state.units[attackerUnitId] : undefined;
  const hyperphaseShot = attacker?.definitionId === "fatebound-silencers";
  const defenseRollAttempts = hyperphaseShot
    ? [rollDefense(target.currentDefense, rng), rollDefense(target.currentDefense, rng)]
    : [rollDefense(target.currentDefense, rng)];
  const defenseRoll = defenseRollAttempts.reduce((lowest, candidate) =>
    candidate.total < lowest.total ? candidate : lowest
  );
  const rawDamage = assessment.attackValue - defenseRoll.total;
  const damage = Math.max(0, rawDamage);

  return {
    status: "resolved",
    attackValue: assessment.attackValue,
    defenseRoll,
    defenseRollAttempts,
    damage
  };
}



/**
 * Resolve a complete sourced Shoot action wherever the result can be represented
 * without guessing. Potentially lethal attacks fail closed before RNG unless
 * the target has explicit kill-VP data and no unresolved On-Death effect.
 */
export function applyShoot(
  state: GameState,
  action: ShootAction,
  resolveModifiers: ShootModifierResolver,
  rng: RandomSource
): ResolutionResult {
  if (action.basedOnEventSequence !== state.eventSequence) {
    return rejected(state, ruleError("STALE_ACTION", `Action was based on event sequence ${action.basedOnEventSequence}; current sequence is ${state.eventSequence}.`));
  }

  const assessment = assessShoot(
    state,
    action.playerId,
    action.payload.attackerUnitId,
    action.payload.targetUnitId,
    resolveModifiers({
      state,
      playerId: action.playerId,
      attackerUnitId: action.payload.attackerUnitId,
      targetUnitId: action.payload.targetUnitId
    })
  );
  if (assessment.status !== "allowed") {
    return rejected(state, assessment.errors[0] ?? ruleError("SHOOT_BLOCKED", "Shoot is not legal."));
  }

  if (
    attackCanReachLethalDamage(state, action.payload.targetUnitId, assessment.attackValue) &&
    !canResolveBaseDestruction(state, action.payload.targetUnitId)
  ) {
    return rejected(
      state,
      ruleError(
        "POTENTIAL_LETHAL_BRANCH_UNRESOLVED",
        "This Shoot could destroy the target on a zero Defense result, but kill VP / On-Death resolution is not fully sourced in executable data."
      )
    );
  }

  const defense = resolveShootDefense(
    state,
    assessment,
    action.payload.targetUnitId,
    rng,
    action.payload.attackerUnitId
  );
  if (defense.status !== "resolved") {
    return rejected(state, defense.errors[0] ?? ruleError("SHOOT_DEFENSE_UNRESOLVED", "Shoot Defense could not be resolved."));
  }

  const damageApplication = applyResolvedCombatDamage(
    state,
    action.playerId,
    action.payload.targetUnitId,
    defense.damage
  );
  if (damageApplication.status !== "applied") {
    return rejected(state, damageApplication.errors[0] ?? ruleError("SHOOT_DAMAGE_UNRESOLVED", "Shoot damage could not be applied."));
  }

  const attacker = damageApplication.nextState.units[action.payload.attackerUnitId];
  if (!attacker) {
    return rejected(state, ruleError("ATTACKER_MISSING", `Unit ${action.payload.attackerUnitId} does not exist.`));
  }
  const units = {
    ...damageApplication.nextState.units,
    [attacker.id]: { ...attacker, activation: "used" as const }
  };
  const postActionState: GameState = { ...damageApplication.nextState, units };
  const priorityResolution = resolvePostActionPriority(postActionState, action.playerId);

  const shootSequence = state.eventSequence + 1;
  const events: GameEvent[] = [
    {
      gameId: state.gameId,
      sequence: shootSequence,
      type: "unit.shot",
      actorId: action.playerId,
      payload: {
        attackerUnitId: action.payload.attackerUnitId,
        targetUnitId: action.payload.targetUnitId,
        distance: assessment.distance,
        attackValue: assessment.attackValue,
        defenseDice: defense.defenseRoll.dice,
        defenseTotal: defense.defenseRoll.total,
        defenseRollAttempts: defense.defenseRollAttempts.map((attempt) => attempt.dice),
        damage: defense.damage,
        destroyed: damageApplication.destroyed,
        offFieldZone: damageApplication.offFieldZone,
        victoryPointsAwarded: damageApplication.victoryPointsAwarded,
        onDeathCommandGained: damageApplication.onDeathCommandGained
      }
    }
  ];
  if (damageApplication.onDeathCommandGained > 0) {
    const destroyedOwnerId = state.units[action.payload.targetUnitId]?.ownerId ?? null;
    events.push({
      gameId: state.gameId,
      sequence: shootSequence + events.length,
      type: "unit.on-death.command-gained",
      actorId: destroyedOwnerId,
      payload: {
        unitId: action.payload.targetUnitId,
        commandGained: damageApplication.onDeathCommandGained
      }
    });
  }
  if (priorityResolution.actionPhaseEnded) {
    events.push({
      gameId: state.gameId,
      sequence: shootSequence + events.length,
      type: "phase.end-round.started",
      actorId: null,
      payload: { round: priorityResolution.roundFlow.round }
    });
  }

  const finalSequence = events[events.length - 1]?.sequence ?? shootSequence;
  const nextState: GameState = {
    ...postActionState,
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

function ruleError(code: string, message: string): RuleError {
  return { code, message };
}

import type { EngineAction, ResolutionResult, RuleError } from "../engine/actions.js";
import type { RandomSource } from "../engine/rng.js";
import type { GameEvent } from "../engine/events.js";
import { assertStateInvariants } from "../engine/invariants.js";
import type { GameState, PlayerId, TerritoryId, UnitId } from "../engine/types.js";
import { rollDefense, type FateRoll } from "./dice.js";
import { resolvePostActionPriority } from "./action-phase.js";
import { recalculateStandardTerritoryControl } from "./objective-control.js";
import { applyResolvedCombatDamage, applyResolvedDestruction, attackCanReachLethalDamage, canResolveBaseDestruction } from "./combat.js";

export type MeleeAction = EngineAction<
  "unit.melee",
  {
    readonly attackerUnitId: UnitId;
    readonly targetUnitId: UnitId;
  }
>;

export type MeleeResponseAction = EngineAction<
  "melee.respond",
  { readonly response: "melee" | "retreat" }
>;

export type MeleeAssessment =
  | { readonly status: "allowed" }
  | { readonly status: "blocked"; readonly errors: readonly RuleError[] };

export type MeleeStrikeResolution =
  | {
      readonly status: "resolved";
      readonly attackValue: number;
      readonly defenseRoll: FateRoll;
      readonly damage: number;
    }
  | {
      readonly status: "unresolved";
      readonly attackValue: number;
      readonly defenseRoll: FateRoll | null;
      readonly errors: readonly RuleError[];
    };

export type MeleeExchangeNumber = 1 | 2 | 3;
export type MeleeSequencePhase =
  | "initiator-strike"
  | "defender-choice"
  | "defender-strike"
  | "complete";
export type MeleeDefenderResponse = "melee" | "retreat";
export type MeleeCompletionReason = "unit-destroyed" | "retreat" | "exchange-limit";

export type RetreatPlacementAssessment =
  | { readonly status: "move"; readonly destinationTerritoryId: TerritoryId }
  | { readonly status: "destroyed"; readonly reason: "NO_TOWARD_STRONGHOLD_DESTINATION" | "DESTINATION_FULL" }
  | { readonly status: "blocked"; readonly errors: readonly RuleError[] };

/**
 * Resolve the sourced Retreat direction on the linear battlefield: one adjacent
 * Territory toward the defender's home Stronghold. Runtime scenario deployment
 * retains each player's sourced starting Territories, allowing the engine to
 * identify the home Stronghold without inferring faction names from UI text.
 */
export function assessRetreatPlacement(
  state: GameState,
  defenderUnitId: UnitId
): RetreatPlacementAssessment {
  const defender = state.units[defenderUnitId];
  if (!defender) return { status: "blocked", errors: [ruleError("DEFENDER_MISSING", `Unit ${defenderUnitId} does not exist.`)] };
  if (defender.territoryId === null) return { status: "blocked", errors: [ruleError("DEFENDER_OFF_FIELD", `Unit ${defenderUnitId} is not on the battlefield.`)] };

  const deployment = state.scenario?.deployment;
  const startingTerritories = deployment?.startingTerritoryIdsByPlayer[defender.ownerId] ?? [];
  const strongholds = startingTerritories.filter((territoryId) =>
    state.territories[territoryId]?.territoryClass.toLowerCase().includes("stronghold")
  );
  if (strongholds.length !== 1 || !strongholds[0]) {
    return {
      status: "blocked",
      errors: [ruleError(
        "RETREAT_STRONGHOLD_UNRESOLVED",
        `Retreat requires exactly one sourced home Stronghold for player ${defender.ownerId}; found ${strongholds.length}.`
      )]
    };
  }

  const currentIndex = state.battlefieldTerritoryIds.indexOf(defender.territoryId);
  const strongholdIndex = state.battlefieldTerritoryIds.indexOf(strongholds[0]);
  if (currentIndex < 0 || strongholdIndex < 0) {
    return {
      status: "blocked",
      errors: [ruleError("BATTLEFIELD_ORDER_MISSING", "Retreat endpoints must exist in battlefield order.")]
    };
  }
  if (currentIndex === strongholdIndex) {
    return { status: "destroyed", reason: "NO_TOWARD_STRONGHOLD_DESTINATION" };
  }

  const step = strongholdIndex > currentIndex ? 1 : -1;
  const destinationTerritoryId = state.battlefieldTerritoryIds[currentIndex + step];
  if (!destinationTerritoryId || !state.territories[destinationTerritoryId]) {
    return { status: "destroyed", reason: "NO_TOWARD_STRONGHOLD_DESTINATION" };
  }
  const capacity = deployment?.maxFriendlyUnitsPerTerritory ?? 3;
  const ownUnits = state.territories[destinationTerritoryId]!.occupantUnitIds.filter(
    (unitId) => state.units[unitId]?.ownerId === defender.ownerId
  ).length;
  if (ownUnits >= capacity) return { status: "destroyed", reason: "DESTINATION_FULL" };
  return { status: "move", destinationTerritoryId };
}

/**
 * Explicit cursor for the owner-approved baseline two-exchange Melee sequence.
 * Royal Guard's sourced Shield Wall ability extends a Melee involving that unit
 * to three exchanges.
 *
 * Exchange 1: initiator strikes -> surviving defender chooses retaliate/Retreat
 * -> retaliation if chosen. Subsequent exchanges repeat while both remain engaged
 * until the applicable exchange limit.
 *
 * A successful Charge begins at the same `initiator-strike` cursor; Charge
 * movement/roll legality is handled by the Charge rules layer, not here.
 */
export interface MeleeSequenceState {
  readonly initiatorUnitId: UnitId;
  readonly defenderUnitId: UnitId;
  readonly exchange: MeleeExchangeNumber;
  readonly phase: MeleeSequencePhase;
  readonly completionReason: MeleeCompletionReason | null;
}

export function getLegalMeleeActions(state: GameState, playerId: PlayerId): readonly MeleeAction[] {
  const player = state.players[playerId];
  if (!player || state.lifecycle !== "active" || state.roundFlow?.phase !== "action") {
    return [];
  }
  if (state.roundFlow.priorityPlayerId !== null && state.roundFlow.priorityPlayerId !== playerId) {
    return [];
  }

  const actions: MeleeAction[] = [];
  for (const attackerUnitId of player.unitIds) {
    for (const target of Object.values(state.units)) {
      if (target.ownerId === playerId) continue;
      const assessment = assessMelee(state, playerId, attackerUnitId, target.id);
      if (assessment.status !== "allowed") continue;
      actions.push({
        id: `unit.melee:${attackerUnitId}:${target.id}:${state.eventSequence}`,
        type: "unit.melee",
        playerId,
        basedOnEventSequence: state.eventSequence,
        payload: { attackerUnitId, targetUnitId: target.id }
      });
    }
  }
  return actions;
}

export function assessMelee(
  state: GameState,
  playerId: PlayerId,
  attackerUnitId: UnitId,
  targetUnitId: UnitId
): MeleeAssessment {
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
    errors.push(ruleError("NOT_ACTION_PHASE", "Melee is only legal during the Action Phase."));
  } else if (flow.priorityPlayerId !== null && flow.priorityPlayerId !== playerId) {
    errors.push(ruleError("NO_PRIORITY", `Player ${playerId} does not currently have activation priority.`));
  }
  if (attacker.ownerId !== playerId) {
    errors.push(ruleError("NOT_UNIT_OWNER", `Player ${playerId} does not own unit ${attackerUnitId}.`));
  }
  if (target.ownerId === playerId) {
    errors.push(ruleError("FRIENDLY_TARGET", "Melee must target an enemy unit."));
  }
  if (attacker.activation !== "ready") {
    errors.push(ruleError("UNIT_DEACTIVATED", `Unit ${attackerUnitId} is not ready to act.`));
  }
  if (attacker.territoryId === null) {
    errors.push(ruleError("ATTACKER_OFF_FIELD", `Unit ${attackerUnitId} is not on the battlefield.`));
  }
  if (target.territoryId === null) {
    errors.push(ruleError("TARGET_OFF_FIELD", `Unit ${targetUnitId} is not on the battlefield.`));
  }
  if (attacker.currentMelee === null) {
    errors.push(ruleError("MELEE_STAT_NULL", `Unit ${attackerUnitId} does not operate with a MELEE stat.`));
  }
  if (
    attacker.territoryId !== null &&
    target.territoryId !== null &&
    attacker.territoryId !== target.territoryId
  ) {
    errors.push(ruleError("MELEE_TARGET_NOT_SAME_TERRITORY", "Melee can only target an enemy unit in the same Territory."));
  }

  return errors.length > 0 ? { status: "blocked", errors } : { status: "allowed" };
}

/**
 * Resolves one sourced Melee strike without mutating match state.
 * ATTACK is the attacker's effective MELEE value; defender rolls effective DEF.
 * Owner ruling: if DEFENSE result exceeds ATTACK, damage floors at 0.
 */
export function resolveMeleeStrike(
  state: GameState,
  attackerUnitId: UnitId,
  targetUnitId: UnitId,
  rng: RandomSource
): MeleeStrikeResolution {
  const attacker = state.units[attackerUnitId];
  const target = state.units[targetUnitId];
  const attackValue = attacker?.currentMelee ?? 0;

  if (!attacker) {
    return {
      status: "unresolved",
      attackValue,
      defenseRoll: null,
      errors: [ruleError("ATTACKER_MISSING", `Unit ${attackerUnitId} does not exist.`)]
    };
  }
  if (!target) {
    return {
      status: "unresolved",
      attackValue,
      defenseRoll: null,
      errors: [ruleError("TARGET_MISSING", `Unit ${targetUnitId} does not exist.`)]
    };
  }
  if (attacker.currentMelee === null) {
    return {
      status: "unresolved",
      attackValue: 0,
      defenseRoll: null,
      errors: [ruleError("MELEE_STAT_NULL", `Unit ${attackerUnitId} does not operate with a MELEE stat.`)]
    };
  }
  if (target.currentDefense === null) {
    return {
      status: "unresolved",
      attackValue: attacker.currentMelee,
      defenseRoll: null,
      errors: [ruleError("RG-003C_NULL_DEFENSE", "Live Working Version does not explicitly state how null DEFENSE resolves when attacked.")]
    };
  }

  const defenseRoll = rollDefense(target.currentDefense, rng);
  const damage = Math.max(0, attacker.currentMelee - defenseRoll.total);
  return { status: "resolved", attackValue: attacker.currentMelee, defenseRoll, damage };
}


/** Sourced Shield Wall: a Melee involving Royal Guard resolves 3 exchanges instead of 2. */
export function getMeleeExchangeLimit(
  state: GameState,
  initiatorUnitId: UnitId,
  defenderUnitId: UnitId
): 2 | 3 {
  const participantDefinitionIds = [initiatorUnitId, defenderUnitId].map(
    (unitId) => state.units[unitId]?.definitionId
  );
  return participantDefinitionIds.includes("iron-wake-royal-guard") ? 3 : 2;
}

export function beginMeleeSequence(
  initiatorUnitId: UnitId,
  defenderUnitId: UnitId
): MeleeSequenceState {
  return {
    initiatorUnitId,
    defenderUnitId,
    exchange: 1,
    phase: "initiator-strike",
    completionReason: null
  };
}

/** Advance after the current strike is fully resolved against match state. */
export function advanceAfterMeleeStrike(
  sequence: MeleeSequenceState,
  targetDestroyed: boolean
): MeleeSequenceState {
  assertSequenceActive(sequence);

  if (sequence.phase === "initiator-strike") {
    if (targetDestroyed) return complete(sequence, "unit-destroyed");
    return { ...sequence, phase: "defender-choice" };
  }

  if (sequence.phase === "defender-strike") {
    if (targetDestroyed) return complete(sequence, "unit-destroyed");
    if (sequence.exchange === 1) {
      return { ...sequence, exchange: 2, phase: "initiator-strike" };
    }
    return complete(sequence, "exchange-limit");
  }

  throw new Error(`Cannot advance after a strike while Melee sequence is in ${sequence.phase}.`);
}

/** Apply the surviving defender's sourced choice: retaliate with Melee or Retreat. */
export function applyMeleeDefenderResponse(
  sequence: MeleeSequenceState,
  response: MeleeDefenderResponse
): MeleeSequenceState {
  assertSequenceActive(sequence);
  if (sequence.phase !== "defender-choice") {
    throw new Error(`Defender response is only legal during defender-choice; received ${sequence.phase}.`);
  }
  if (response === "retreat") return complete(sequence, "retreat");
  return { ...sequence, phase: "defender-strike" };
}



/** Begin a sourced Melee action and lock the game into its combat sequence. */
export function applyMeleeAction(state: GameState, action: MeleeAction): ResolutionResult {
  if (action.basedOnEventSequence !== state.eventSequence) {
    return rejected(state, ruleError("STALE_ACTION", `Action was based on event sequence ${action.basedOnEventSequence}; current sequence is ${state.eventSequence}.`));
  }
  const assessment = assessMelee(
    state,
    action.playerId,
    action.payload.attackerUnitId,
    action.payload.targetUnitId
  );
  if (assessment.status !== "allowed") {
    return rejected(state, assessment.errors[0] ?? ruleError("MELEE_BLOCKED", "Melee is not legal."));
  }
  const attacker = state.units[action.payload.attackerUnitId];
  if (!attacker) return rejected(state, ruleError("ATTACKER_MISSING", `Unit ${action.payload.attackerUnitId} does not exist.`));

  const sequence = state.eventSequence + 1;
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [attacker.id]: { ...attacker, activation: "used" as const }
    },
    pendingMelee: {
      initiatorUnitId: action.payload.attackerUnitId,
      defenderUnitId: action.payload.targetUnitId,
      actingPlayerId: action.playerId,
      exchange: 1,
      phase: "initiator-strike",
      sourceAction: "melee"
    },
    eventSequence: sequence
  };
  const events: GameEvent[] = [{
    gameId: state.gameId,
    sequence,
    type: "melee.engaged",
    actorId: action.playerId,
    payload: {
      initiatorUnitId: action.payload.attackerUnitId,
      defenderUnitId: action.payload.targetUnitId,
      exchange: 1,
      sourceAction: "melee"
    }
  }];
  assertStateInvariants(nextState);
  return { accepted: true, nextState, events };
}

/**
 * Advance one deterministic strike inside an already-engaged Melee sequence.
 * No player choice is invented here; this transition is legal only while the
 * pending cursor is at initiator-strike or defender-strike.
 */
export function advancePendingMelee(state: GameState, rng: RandomSource): ResolutionResult {
  const pending = state.pendingMelee;
  if (!pending) return rejected(state, ruleError("NO_PENDING_MELEE", "There is no pending Melee sequence."));
  if (pending.phase === "defender-choice") {
    return rejected(state, ruleError("DEFENDER_RESPONSE_REQUIRED", "The defender must choose Melee or Retreat before combat can continue."));
  }

  const strikeAttackerUnitId = pending.phase === "initiator-strike"
    ? pending.initiatorUnitId
    : pending.defenderUnitId;
  const strikeTargetUnitId = pending.phase === "initiator-strike"
    ? pending.defenderUnitId
    : pending.initiatorUnitId;
  const strikeAttacker = state.units[strikeAttackerUnitId];
  if (!strikeAttacker || strikeAttacker.currentMelee === null) {
    return rejected(state, ruleError("MELEE_STAT_NULL", `Unit ${strikeAttackerUnitId} cannot resolve a Melee strike.`));
  }

  if (
    attackCanReachLethalDamage(state, strikeTargetUnitId, strikeAttacker.currentMelee) &&
    !canResolveBaseDestruction(state, strikeTargetUnitId)
  ) {
    return rejected(
      state,
      ruleError(
        "POTENTIAL_LETHAL_BRANCH_UNRESOLVED",
        "This Melee strike could destroy its target on a zero Defense result, but kill VP / On-Death resolution is not fully sourced in executable data."
      )
    );
  }

  const strike = resolveMeleeStrike(state, strikeAttackerUnitId, strikeTargetUnitId, rng);
  if (strike.status !== "resolved") {
    return rejected(state, strike.errors[0] ?? ruleError("MELEE_STRIKE_UNRESOLVED", "Melee strike could not be resolved."));
  }
  const damage = applyResolvedCombatDamage(
    state,
    strikeAttacker.ownerId,
    strikeTargetUnitId,
    strike.damage
  );
  if (damage.status !== "applied") {
    return rejected(state, damage.errors[0] ?? ruleError("MELEE_DAMAGE_UNRESOLVED", "Melee damage could not be applied."));
  }

  const strikeSequence = state.eventSequence + 1;
  const events: GameEvent[] = [{
    gameId: state.gameId,
    sequence: strikeSequence,
    type: "melee.struck",
    actorId: strikeAttacker.ownerId,
    payload: {
      attackerUnitId: strikeAttackerUnitId,
      targetUnitId: strikeTargetUnitId,
      exchange: pending.exchange,
      phase: pending.phase,
      attackValue: strike.attackValue,
      defenseDice: strike.defenseRoll.dice,
      defenseTotal: strike.defenseRoll.total,
      damage: strike.damage,
      destroyed: damage.destroyed,
      offFieldZone: damage.offFieldZone,
      victoryPointsAwarded: damage.victoryPointsAwarded,
      onDeathCommandGained: damage.onDeathCommandGained
    }
  }];

  if (damage.onDeathCommandGained > 0) {
    const destroyedOwnerId = state.units[strikeTargetUnitId]?.ownerId ?? null;
    events.push({
      gameId: state.gameId,
      sequence: strikeSequence + events.length,
      type: "unit.on-death.command-gained",
      actorId: destroyedOwnerId,
      payload: { unitId: strikeTargetUnitId, commandGained: damage.onDeathCommandGained }
    });
  }

  let working: GameState = {
    ...damage.nextState,
    eventSequence: events[events.length - 1]?.sequence ?? strikeSequence
  };

  if (damage.destroyed) {
    working = { ...working, pendingMelee: null };
    return finishMeleeAction(state, working, pending.actingPlayerId, events);
  }

  if (pending.phase === "initiator-strike") {
    working = {
      ...working,
      pendingMelee: { ...pending, phase: "defender-choice" }
    };
    events.push({
      gameId: state.gameId,
      sequence: working.eventSequence + 1,
      type: "melee.response.required",
      actorId: state.units[pending.defenderUnitId]?.ownerId ?? null,
      payload: {
        defenderUnitId: pending.defenderUnitId,
        exchange: pending.exchange,
        choices: ["melee", "retreat"]
      }
    });
    working = { ...working, eventSequence: events[events.length - 1]?.sequence ?? working.eventSequence };
    assertStateInvariants(working);
    return { accepted: true, nextState: working, events };
  }

  const exchangeLimit = getMeleeExchangeLimit(working, pending.initiatorUnitId, pending.defenderUnitId);
  if (pending.exchange < exchangeLimit) {
    working = {
      ...working,
      pendingMelee: {
        ...pending,
        exchange: (pending.exchange + 1) as MeleeExchangeNumber,
        phase: "initiator-strike"
      }
    };
    assertStateInvariants(working);
    return { accepted: true, nextState: working, events };
  }

  working = { ...working, pendingMelee: null };
  return finishMeleeAction(state, working, pending.actingPlayerId, events);
}

/** Record the defender's real mid-combat choice without inventing a UI gesture. */
export function respondToPendingMelee(state: GameState, action: MeleeResponseAction): ResolutionResult {
  if (action.basedOnEventSequence !== state.eventSequence) {
    return rejected(state, ruleError("STALE_ACTION", `Action was based on event sequence ${action.basedOnEventSequence}; current sequence is ${state.eventSequence}.`));
  }
  const pending = state.pendingMelee;
  if (!pending || pending.phase !== "defender-choice") {
    return rejected(state, ruleError("MELEE_RESPONSE_NOT_AVAILABLE", "Melee response is only legal while a defender choice is pending."));
  }
  const defender = state.units[pending.defenderUnitId];
  if (!defender) return rejected(state, ruleError("DEFENDER_MISSING", `Unit ${pending.defenderUnitId} does not exist.`));
  if (defender.ownerId !== action.playerId) {
    return rejected(state, ruleError("NOT_DEFENDER_OWNER", `Player ${action.playerId} does not own the defending unit.`));
  }

  if (action.payload.response === "retreat") {
    const placement = assessRetreatPlacement(state, defender.id);
    if (placement.status === "blocked") {
      return rejected(state, placement.errors[0] ?? ruleError("RETREAT_PLACEMENT_UNRESOLVED", "Retreat placement could not be resolved."));
    }

    const responseSequence = state.eventSequence + 1;
    const events: GameEvent[] = [];
    let working = state;

    if (placement.status === "move") {
      const fromTerritoryId = defender.territoryId;
      if (fromTerritoryId === null) return rejected(state, ruleError("DEFENDER_OFF_FIELD", `Unit ${defender.id} is not on the battlefield.`));
      const source = state.territories[fromTerritoryId];
      const destination = state.territories[placement.destinationTerritoryId];
      if (!source || !destination) return rejected(state, ruleError("RETREAT_TERRITORY_MISSING", "Retreat source or destination Territory is missing."));
      const units = {
        ...state.units,
        [defender.id]: { ...defender, territoryId: placement.destinationTerritoryId, activation: "used" as const }
      };
      const territories = {
        ...state.territories,
        [fromTerritoryId]: { ...source, occupantUnitIds: source.occupantUnitIds.filter((id) => id !== defender.id) },
        [placement.destinationTerritoryId]: { ...destination, occupantUnitIds: [...destination.occupantUnitIds, defender.id] }
      };
      working = recalculateStandardTerritoryControl({ ...state, units, territories, pendingMelee: null });
      events.push({
        gameId: state.gameId,
        sequence: responseSequence,
        type: "melee.retreat",
        actorId: action.playerId,
        payload: {
          defenderUnitId: defender.id,
          fromTerritoryId,
          toTerritoryId: placement.destinationTerritoryId,
          destroyed: false
        }
      });
      working = { ...working, eventSequence: responseSequence };
    } else {
      const destruction = applyResolvedDestruction(state, pending.actingPlayerId, defender.id);
      if (destruction.status !== "applied") {
        return rejected(state, destruction.errors[0] ?? ruleError("RETREAT_DESTRUCTION_UNRESOLVED", "Retreat destruction could not be resolved."));
      }
      working = { ...destruction.nextState, pendingMelee: null };
      events.push({
        gameId: state.gameId,
        sequence: responseSequence,
        type: "melee.retreat",
        actorId: action.playerId,
        payload: {
          defenderUnitId: defender.id,
          fromTerritoryId: defender.territoryId,
          toTerritoryId: null,
          destroyed: true,
          reason: placement.reason,
          offFieldZone: destruction.offFieldZone,
          victoryPointsAwarded: destruction.victoryPointsAwarded,
          onDeathCommandGained: destruction.onDeathCommandGained
        }
      });
      if (destruction.onDeathCommandGained > 0) {
        events.push({
          gameId: state.gameId,
          sequence: responseSequence + events.length,
          type: "unit.on-death.command-gained",
          actorId: defender.ownerId,
          payload: { unitId: defender.id, commandGained: destruction.onDeathCommandGained }
        });
      }
      working = { ...working, eventSequence: events[events.length - 1]?.sequence ?? responseSequence };
    }

    return finishMeleeAction(state, working, pending.actingPlayerId, events);
  }
  if (defender.currentMelee === null) {
    return rejected(state, ruleError("MELEE_STAT_NULL", `Defender ${defender.id} cannot choose a Melee response without a MELEE stat.`));
  }

  const sequence = state.eventSequence + 1;
  const nextState: GameState = {
    ...state,
    pendingMelee: { ...pending, phase: "defender-strike" },
    eventSequence: sequence
  };
  const events: GameEvent[] = [{
    gameId: state.gameId,
    sequence,
    type: "melee.response",
    actorId: action.playerId,
    payload: {
      defenderUnitId: defender.id,
      exchange: pending.exchange,
      response: "melee"
    }
  }];
  assertStateInvariants(nextState);
  return { accepted: true, nextState, events };
}

function finishMeleeAction(
  originalState: GameState,
  stateAfterCombat: GameState,
  actingPlayerId: PlayerId,
  events: GameEvent[]
): ResolutionResult {
  const priorityResolution = resolvePostActionPriority(stateAfterCombat, actingPlayerId);
  if (priorityResolution.actionPhaseEnded) {
    events.push({
      gameId: originalState.gameId,
      sequence: stateAfterCombat.eventSequence + 1,
      type: "phase.end-round.started",
      actorId: null,
      payload: { round: priorityResolution.roundFlow.round }
    });
  }
  const finalSequence = events[events.length - 1]?.sequence ?? stateAfterCombat.eventSequence;
  const nextState: GameState = {
    ...stateAfterCombat,
    roundFlow: priorityResolution.roundFlow,
    scenario: priorityResolution.actionPhaseEnded && stateAfterCombat.scenario
      ? { ...stateAfterCombat.scenario, round: priorityResolution.roundFlow.round, phase: "end-round" }
      : stateAfterCombat.scenario,
    eventSequence: finalSequence
  };
  assertStateInvariants(nextState);
  return { accepted: true, nextState, events };
}

function rejected(state: GameState, error: RuleError): ResolutionResult {
  return { accepted: false, nextState: state, events: [], error };
}

function complete(sequence: MeleeSequenceState, reason: MeleeCompletionReason): MeleeSequenceState {
  return { ...sequence, phase: "complete", completionReason: reason };
}

function assertSequenceActive(sequence: MeleeSequenceState): void {
  if (sequence.phase === "complete") {
    throw new Error(`Melee sequence is already complete (${sequence.completionReason ?? "unknown"}).`);
  }
}

function ruleError(code: string, message: string): RuleError {
  return { code, message };
}

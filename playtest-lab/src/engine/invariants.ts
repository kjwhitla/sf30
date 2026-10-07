import type { GameState } from "./types.js";

export interface StateInvariantIssue {
  readonly code: string;
  readonly message: string;
}

/**
 * Validates referential/state consistency only. It intentionally does not
 * validate game-rule semantics such as movement legality, OC, combat, timing,
 * scoring, CP spend, or victory conditions.
 */
export function validateStateInvariants(state: GameState): readonly StateInvariantIssue[] {
  const issues: StateInvariantIssue[] = [];

  for (const [playerId, player] of Object.entries(state.players)) {
    if (player.id !== playerId) {
      issues.push(issue("PLAYER_KEY_MISMATCH", `Player record key ${playerId} does not match player.id ${player.id}.`));
    }

    for (const unitId of player.unitIds) {
      const unit = state.units[unitId];
      if (!unit) {
        issues.push(issue("PLAYER_UNIT_MISSING", `Player ${playerId} references missing unit ${unitId}.`));
      } else if (unit.ownerId !== playerId) {
        issues.push(issue("PLAYER_UNIT_OWNER_MISMATCH", `Player ${playerId} references unit ${unitId} owned by ${unit.ownerId}.`));
      }
    }
  }


  for (const [definitionId, definition] of Object.entries(state.unitDefinitions)) {
    if (definition.id !== definitionId) {
      issues.push(issue("UNIT_DEFINITION_KEY_MISMATCH", `Unit definition record key ${definitionId} does not match definition.id ${definition.id}.`));
    }
    if (definition.sources.length === 0) {
      issues.push(issue("UNIT_DEFINITION_SOURCE_MISSING", `Unit definition ${definitionId} has no provenance source.`));
    }
    for (const source of definition.sources) {
      if (!source.id.trim() || !source.title.trim() || !source.version.trim()) {
        issues.push(issue("UNIT_DEFINITION_SOURCE_INVALID", `Unit definition ${definitionId} contains incomplete provenance.`));
      }
    }
  }

  for (const [unitId, unit] of Object.entries(state.units)) {
    if (unit.id !== unitId) {
      issues.push(issue("UNIT_KEY_MISMATCH", `Unit record key ${unitId} does not match unit.id ${unit.id}.`));
    }
    if (!state.players[unit.ownerId]) {
      issues.push(issue("UNIT_OWNER_MISSING", `Unit ${unitId} references missing owner ${unit.ownerId}.`));
    }
    if (!state.unitDefinitions[unit.definitionId]) {
      issues.push(issue("UNIT_DEFINITION_MISSING", `Unit ${unitId} references missing definition ${unit.definitionId}.`));
    }
    if (unit.activation !== "ready" && unit.activation !== "used") {
      issues.push(issue("UNIT_ACTIVATION_INVALID", `Unit ${unitId} has invalid activation state ${String(unit.activation)}.`));
    }
    if (!Number.isFinite(unit.currentHealth)) {
      issues.push(issue("UNIT_CURRENT_HEALTH_INVALID", `Unit ${unitId} has invalid currentHealth ${String(unit.currentHealth)}.`));
    }
    if (!Number.isInteger(unit.wounds) || unit.wounds < 0) {
      issues.push(issue("UNIT_WOUNDS_INVALID", `Unit ${unitId} has invalid wounds ${String(unit.wounds)}.`));
    }
    if (!Number.isFinite(unit.currentMovement)) {
      issues.push(issue("UNIT_CURRENT_MOVEMENT_INVALID", `Unit ${unitId} has invalid currentMovement ${String(unit.currentMovement)}.`));
    }
    for (const modifier of unit.temporaryStatModifiers) {
      if (!modifier.id.trim() || !Number.isFinite(modifier.amount)) {
        issues.push(issue("UNIT_TEMP_MODIFIER_INVALID", `Unit ${unitId} has an invalid temporary stat modifier.`));
      }
    }
    for (const [statName, value] of [
      ["currentShoot", unit.currentShoot],
      ["currentMelee", unit.currentMelee],
      ["currentDefense", unit.currentDefense],
      ["currentObjectiveControl", unit.currentObjectiveControl]
    ] as const) {
      if (value !== null && !Number.isFinite(value)) {
        issues.push(issue("UNIT_CURRENT_STAT_INVALID", `Unit ${unitId} has invalid ${statName} ${String(value)}.`));
      }
    }
    if (unit.territoryId !== null) {
      const territory = state.territories[unit.territoryId];
      if (!territory) {
        issues.push(issue("UNIT_TERRITORY_MISSING", `Unit ${unitId} references missing territory ${unit.territoryId}.`));
      } else if (!territory.occupantUnitIds.includes(unitId)) {
        issues.push(issue("UNIT_TERRITORY_ASYMMETRY", `Unit ${unitId} is in ${unit.territoryId}, but territory occupants do not include it.`));
      }
    }
  }

  const orderedTerritories = new Set<string>();
  for (const territoryId of state.battlefieldTerritoryIds) {
    if (orderedTerritories.has(territoryId)) {
      issues.push(issue("BATTLEFIELD_ORDER_DUPLICATE", `Battlefield order repeats territory ${territoryId}.`));
    }
    orderedTerritories.add(territoryId);
    if (!state.territories[territoryId]) {
      issues.push(issue("BATTLEFIELD_ORDER_MISSING_TERRITORY", `Battlefield order references missing territory ${territoryId}.`));
    }
  }

  if (state.roundFlow !== null) {
    if (!Number.isInteger(state.roundFlow.round) || state.roundFlow.round < 1) {
      issues.push(issue("ROUND_FLOW_ROUND_INVALID", `Round flow has invalid round ${state.roundFlow.round}.`));
    }
    if (!state.players[state.roundFlow.firstPlayerId]) {
      issues.push(issue("ROUND_FLOW_FIRST_PLAYER_MISSING", `Round flow references missing first player ${state.roundFlow.firstPlayerId}.`));
    }
    if (state.roundFlow.priorityPlayerId !== null && !state.players[state.roundFlow.priorityPlayerId]) {
      issues.push(issue("ROUND_FLOW_PRIORITY_PLAYER_MISSING", `Round flow references missing priority player ${state.roundFlow.priorityPlayerId}.`));
    }
  }

  if (state.pendingMelee !== null) {
    const pending = state.pendingMelee;
    if (!state.units[pending.initiatorUnitId]) {
      issues.push(issue("PENDING_MELEE_INITIATOR_MISSING", `Pending Melee references missing initiator ${pending.initiatorUnitId}.`));
    }
    if (!state.units[pending.defenderUnitId]) {
      issues.push(issue("PENDING_MELEE_DEFENDER_MISSING", `Pending Melee references missing defender ${pending.defenderUnitId}.`));
    }
    if (!state.players[pending.actingPlayerId]) {
      issues.push(issue("PENDING_MELEE_ACTOR_MISSING", `Pending Melee references missing acting player ${pending.actingPlayerId}.`));
    }
    if (state.roundFlow?.phase !== "action") {
      issues.push(issue("PENDING_MELEE_OUTSIDE_ACTION", "Pending Melee may only exist during the Action Phase."));
    }
  }

  for (const [territoryId, territory] of Object.entries(state.territories)) {
    if (territory.id !== territoryId) {
      issues.push(issue("TERRITORY_KEY_MISMATCH", `Territory record key ${territoryId} does not match territory.id ${territory.id}.`));
    }

    for (const unitId of territory.occupantUnitIds) {
      const unit = state.units[unitId];
      if (!unit) {
        issues.push(issue("TERRITORY_UNIT_MISSING", `Territory ${territoryId} references missing unit ${unitId}.`));
      } else if (unit.territoryId !== territoryId) {
        issues.push(issue("TERRITORY_UNIT_ASYMMETRY", `Territory ${territoryId} lists unit ${unitId}, but the unit points to ${String(unit.territoryId)}.`));
      }
    }

    if (territory.control.kind === "controlled") {
      if (territory.control.controlledBy === null) {
        issues.push(issue("CONTROL_OWNER_MISSING", `Controlled territory ${territoryId} has no controlling player.`));
      } else if (!state.players[territory.control.controlledBy]) {
        issues.push(issue("CONTROL_PLAYER_MISSING", `Territory ${territoryId} is controlled by missing player ${territory.control.controlledBy}.`));
      }
    } else if (territory.control.controlledBy !== null) {
      issues.push(issue("CONTROL_OWNER_UNEXPECTED", `${territory.control.kind} territory ${territoryId} must not name a controlling player.`));
    }
  }

  return issues;
}

export function assertStateInvariants(state: GameState): void {
  const issues = validateStateInvariants(state);
  if (issues.length > 0) {
    const summary = issues.map((item) => `${item.code}: ${item.message}`).join("\n");
    throw new Error(`GameState invariant failure:\n${summary}`);
  }
}

function issue(code: string, message: string): StateInvariantIssue {
  return { code, message };
}

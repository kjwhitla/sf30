import type { SourcedDefinition } from "./provenance.js";

/**
 * Mechanics-neutral state contracts for Strikeforce30.
 *
 * These types encode authored/base values separately from mutable match state.
 * Effective unit values are recalculated from printed stats, persistent wounds,
 * and the temporary modifiers that are valid in the unit's current context.
 */

export type GameId = string;
export type PlayerId = string;
export type FactionId = string;
export type UnitId = string;
export type UnitDefinitionId = string;
export type TerritoryId = string;
export type ScenarioId = string;
export type PhaseId = string;
export type StrikeforcePhase = "command" | "action" | "end-round";
export type EffectId = string;

export interface PendingMeleeState {
  readonly initiatorUnitId: UnitId;
  readonly defenderUnitId: UnitId;
  readonly actingPlayerId: PlayerId;
  readonly exchange: 1 | 2 | 3;
  readonly phase: "initiator-strike" | "defender-choice" | "defender-strike";
  readonly sourceAction: "melee" | "charge";
}

export type GameLifecycle = "setup" | "active" | "complete";
export type TerritoryControlKind = "uncontrolled" | "contested" | "controlled";
export type ActivationState = "ready" | "used";

export type UnitStatKey =
  | "health"
  | "shoot"
  | "melee"
  | "defense"
  | "objectiveControl"
  | "movement";

export type UnitModifierSource =
  | "environment"
  | "action"
  | "token"
  | "ability"
  | "territory"
  | "scenario"
  | "other";

/**
 * A modifier whose validity is contextual/temporary rather than permanent.
 * These are cleared/rebuilt at the Command Phase Update Tokens step from the
 * unit's current board context. Wounds are deliberately NOT represented here.
 */
export interface UnitStatModifier {
  readonly id: string;
  readonly stat: UnitStatKey;
  readonly amount: number;
  readonly source: UnitModifierSource;
  readonly label?: string;
}

export interface UnitStats {
  readonly health: number;
  readonly shoot: number | null;
  readonly melee: number | null;
  readonly defense: number | null;
  readonly objectiveControl: number | null;
  readonly movement: number;
}

export interface UnitDefinition extends SourcedDefinition {
  readonly id: UnitDefinitionId;
  readonly name: string;
  readonly factionId: FactionId;
  readonly unitClass: string;
  readonly stars: number | null;
  readonly flags: number | null;
  readonly stats: UnitStats;
  readonly abilityText: string | null;
  readonly onDeathText: string | null;
  /** Kill VP printed on the card when explicitly sourced; null/absent remains unresolved. */
  readonly destroyedVictoryPoints?: number | null;
}

export interface UnitState {
  readonly id: UnitId;
  readonly definitionId: UnitDefinitionId;
  readonly ownerId: PlayerId;
  readonly territoryId: TerritoryId | null;
  /** Persistent wound / damage-token count. Does not clear between rounds. */
  readonly wounds: number;
  /** Contextual modifiers that clear/rebuild between rounds. */
  readonly temporaryStatModifiers: readonly UnitStatModifier[];
  readonly currentHealth: number;
  readonly currentShoot: number | null;
  readonly currentMelee: number | null;
  readonly currentDefense: number | null;
  readonly currentObjectiveControl: number | null;
  readonly currentMovement: number;
  readonly activation: ActivationState;
  readonly effectIds: readonly EffectId[];
  /** Explicit only when known; legacy/off-field setup units may leave this undefined. */
  readonly offFieldZone?: "reserves" | "destroyed" | null;
}

export interface PlayerState {
  readonly id: PlayerId;
  readonly factionId: FactionId;
  readonly command: number;
  readonly victoryPoints: number;
  readonly unitIds: readonly UnitId[];
}

export interface TerritoryControlState {
  readonly kind: TerritoryControlKind;
  readonly controlledBy: PlayerId | null;
}

export interface TerritoryState {
  readonly id: TerritoryId;
  readonly name: string;
  readonly territoryClass: string;
  readonly occupantUnitIds: readonly UnitId[];
  readonly control: TerritoryControlState;
  readonly activation: ActivationState | null;
  readonly effectIds: readonly EffectId[];
}

export interface ScenarioDeploymentState {
  readonly maxFriendlyUnitsPerTerritory: number;
  /** Runtime player-keyed starting Territories retained from sourced scenario deployment. */
  readonly startingTerritoryIdsByPlayer: Readonly<Record<PlayerId, readonly TerritoryId[]>>;
  readonly actionEconomyException: boolean;
  readonly startingTerritorySlotCapacityByPlayer: Readonly<Record<PlayerId, number>>;
  readonly legalStartingDeploymentCapacityByPlayer: Readonly<Record<PlayerId, number>>;
  readonly cardGrantedDeploymentCapacityByPlayer: Readonly<Record<PlayerId, number>>;
}

export interface ScenarioState {
  readonly id: ScenarioId;
  readonly name: string;
  readonly round: number | null;
  readonly phase: PhaseId | null;
  readonly deployment: ScenarioDeploymentState | null;
}

export interface RoundFlowState {
  readonly round: number;
  readonly phase: StrikeforcePhase;
  readonly firstPlayerId: PlayerId;
  readonly priorityPlayerId: PlayerId | null;
}

export interface GameState {
  readonly schemaVersion: 7;
  readonly gameId: GameId;
  readonly seed: number;
  readonly lifecycle: GameLifecycle;
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly units: Readonly<Record<UnitId, UnitState>>;
  readonly unitDefinitions: Readonly<Record<UnitDefinitionId, UnitDefinition>>;
  readonly territories: Readonly<Record<TerritoryId, TerritoryState>>;
  readonly battlefieldTerritoryIds: readonly TerritoryId[];
  readonly roundFlow: RoundFlowState | null;
  readonly scenario: ScenarioState | null;
  readonly pendingMelee: PendingMeleeState | null;
  readonly eventSequence: number;
}

export interface InitialGameStateInput {
  readonly gameId: GameId;
  readonly seed: number;
  readonly players?: Readonly<Record<PlayerId, PlayerState>>;
  readonly units?: Readonly<Record<UnitId, UnitState>>;
  readonly unitDefinitions?: Readonly<Record<UnitDefinitionId, UnitDefinition>>;
  readonly territories?: Readonly<Record<TerritoryId, TerritoryState>>;
  readonly battlefieldTerritoryIds?: readonly TerritoryId[];
  readonly roundFlow?: RoundFlowState | null;
  readonly scenario?: ScenarioState | null;
  readonly pendingMelee?: PendingMeleeState | null;
}

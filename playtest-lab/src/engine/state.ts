import type { GameState, InitialGameStateInput, PlayerState, UnitDefinition, UnitState } from "./types.js";
import { assertStateInvariants } from "./invariants.js";

export function createInitialGameState(input: InitialGameStateInput): GameState {
  assertNonEmpty(input.gameId, "gameId");
  const unitDefinitions = cloneRecord(input.unitDefinitions ?? {});

  const state: GameState = {
    schemaVersion: 7,
    gameId: input.gameId,
    seed: Math.trunc(input.seed) >>> 0,
    lifecycle: "setup",
    players: normalizePlayers(cloneRecord(input.players ?? {})),
    units: normalizeUnits(cloneRecord(input.units ?? {}), unitDefinitions),
    unitDefinitions,
    territories: cloneRecord(input.territories ?? {}),
    battlefieldTerritoryIds: [...(input.battlefieldTerritoryIds ?? [])],
    roundFlow: input.roundFlow ?? null,
    scenario: input.scenario ?? null,
    pendingMelee: input.pendingMelee ?? null,
    eventSequence: 0
  };

  assertStateInvariants(state);
  return state;
}

export function serializeGameState(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeGameState(serialized: string): GameState {
  const value: unknown = JSON.parse(serialized);
  assertGameStateEnvelope(value);

  const candidate = value as Record<string, unknown> & {
    schemaVersion: 2 | 3 | 4 | 5 | 6 | 7;
    unitDefinitions: Readonly<Record<string, UnitDefinition>>;
    units: Readonly<Record<string, UnitState>>;
  };

  const normalized: GameState = {
    ...(candidate as unknown as GameState),
    schemaVersion: 7,
    players: normalizePlayers(candidate.players as Readonly<Record<string, PlayerState>>),
    units: normalizeUnits(candidate.units, candidate.unitDefinitions),
    battlefieldTerritoryIds: (candidate.battlefieldTerritoryIds as readonly string[] | undefined) ?? [],
    roundFlow: (candidate.roundFlow as GameState["roundFlow"] | undefined) ?? null,
    scenario: normalizeScenario(candidate.scenario as GameState["scenario"] | undefined),
    pendingMelee: (candidate.pendingMelee as GameState["pendingMelee"] | undefined) ?? null
  };
  assertStateInvariants(normalized);
  return normalized;
}

function normalizeScenario(scenario: GameState["scenario"] | undefined): GameState["scenario"] {
  if (!scenario) return null;
  type CurrentDeployment = NonNullable<NonNullable<GameState["scenario"]>["deployment"]>;
  const deployment = scenario.deployment as (CurrentDeployment & { readonly standardStartingUnitCap?: number }) | null;
  if (!deployment) return { ...scenario, deployment: null };
  const { standardStartingUnitCap: _legacyStartingUnitCap, ...currentDeployment } = deployment;
  return {
    ...scenario,
    deployment: {
      ...currentDeployment,
      startingTerritoryIdsByPlayer: currentDeployment.startingTerritoryIdsByPlayer ?? {}
    }
  };
}

function normalizePlayers(
  players: Readonly<Record<string, PlayerState>>
): Readonly<Record<string, PlayerState>> {
  return Object.fromEntries(
    Object.entries(players).map(([playerId, rawPlayer]) => {
      const player = rawPlayer as PlayerState & { command?: number; commandPoints?: number };
      const { commandPoints: legacyCommandPoints, ...current } = player;
      return [
        playerId,
        {
          ...current,
          command: player.command ?? legacyCommandPoints ?? 0
        }
      ];
    })
  );
}

function normalizeUnits(
  units: Readonly<Record<string, UnitState>>,
  definitions: Readonly<Record<string, UnitDefinition>>
): Readonly<Record<string, UnitState>> {
  return Object.fromEntries(
    Object.entries(units).map(([unitId, rawUnit]) => {
      const unit = rawUnit as UnitState & {
        wounds?: number;
        temporaryStatModifiers?: UnitState["temporaryStatModifiers"];
        currentMovement?: number;
      };
      const definition = definitions[unit.definitionId];
      const inferredWounds = definition
        ? Math.max(0, Math.trunc(definition.stats.health - unit.currentHealth))
        : 0;
      return [
        unitId,
        {
          ...unit,
          wounds: unit.wounds ?? inferredWounds,
          temporaryStatModifiers: [...(unit.temporaryStatModifiers ?? [])],
          currentMovement: unit.currentMovement ?? definition?.stats.movement ?? 1
        }
      ];
    })
  );
}

function cloneRecord<T>(record: Readonly<Record<string, T>>): Readonly<Record<string, T>> {
  return { ...record };
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} must not be empty.`);
  }
}

function assertGameStateEnvelope(
  value: unknown
): asserts value is Record<string, unknown> & {
  schemaVersion: 2 | 3 | 4 | 5 | 6 | 7;
  unitDefinitions: Readonly<Record<string, UnitDefinition>>;
  units: Readonly<Record<string, UnitState>>;
} {
  if (typeof value !== "object" || value === null) {
    throw new Error("Serialized game state must be an object.");
  }

  const candidate = value as {
    schemaVersion?: number;
    gameId?: unknown;
    seed?: unknown;
    players?: unknown;
    units?: unknown;
    territories?: unknown;
    unitDefinitions?: unknown;
  };
  if (candidate.schemaVersion !== 2 && candidate.schemaVersion !== 3 && candidate.schemaVersion !== 4 && candidate.schemaVersion !== 5 && candidate.schemaVersion !== 6 && candidate.schemaVersion !== 7) {
    throw new Error("Unsupported GameState schemaVersion.");
  }
  if (typeof candidate.gameId !== "string" || candidate.gameId.trim().length === 0) {
    throw new Error("GameState.gameId must be a non-empty string.");
  }
  if (typeof candidate.seed !== "number" || !Number.isFinite(candidate.seed)) {
    throw new Error("GameState.seed must be a finite number.");
  }
  if (!candidate.players || !candidate.units || !candidate.territories || !candidate.unitDefinitions) {
    throw new Error("GameState is missing required state collections.");
  }
}

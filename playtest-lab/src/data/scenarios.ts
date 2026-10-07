import type { FactionId } from "../engine/types.js";
import { assertSourcesPresent } from "../engine/provenance.js";
import type { SourcedDefinition } from "../engine/provenance.js";
import { INITIAL_TERRITORIES_BY_ID, resolveInitialTerritoryId } from "./territories.js";
import {
  DEPLOYMENT_ACTION_ECONOMY_SOURCE,
  INITIAL_SCENARIO_SET_SOURCE,
  INITIAL_TERRITORY_LIBRARY_SOURCE
} from "../rules/sources.js";

export const IRON_WAKE_FACTION_ID = "iron-wake" as const;
export const FATEBOUND_FACTION_ID = "fatebound" as const;

export type InitialScenarioFactionId =
  | typeof IRON_WAKE_FACTION_ID
  | typeof FATEBOUND_FACTION_ID;

export type ScenarioGameSize = "small" | "medium" | "large";

export interface NumericRange {
  readonly min: number;
  readonly max: number | null;
}

export interface ScenarioTerritorySlot {
  /** Scenario-local slot id from the supplied scenario document (T1, T2, ...). */
  readonly id: string;
  readonly name: string;
  /** Reusable Territory Library identity when the scenario slot maps cleanly; null means scenario-local/custom. */
  readonly territoryDefinitionId: string | null;
}

export interface InitialScenarioDefinition extends SourcedDefinition {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly gameSize: ScenarioGameSize;
  readonly territoryCount: NumericRange;
  readonly armyPoints: NumericRange;
  readonly vpThreshold: number | null;
  readonly roundLimit: number;
  readonly maxFriendlyUnitsPerTerritory: number;
  readonly deployToLegalCapacity: boolean;
  readonly territorySlots: readonly ScenarioTerritorySlot[];
  readonly startingSlotIdsByFaction: Readonly<Record<InitialScenarioFactionId, readonly string[]>>;
  readonly startingTokens: readonly string[];
  readonly territoryAbilities: readonly string[];
  readonly relevantUnitInteractions: readonly string[];
  readonly victoryRules: readonly string[];
  readonly designGoal: string;
  readonly primaryMechanics: readonly string[];
  /**
   * Only scenario structure/deployment metadata is executable today. Candidate
   * battlefield effects remain text until their underlying rules are promoted.
   */
  readonly executableStatus: "deployment-structure-only";
}

const SOURCES = Object.freeze([
  INITIAL_SCENARIO_SET_SOURCE,
  DEPLOYMENT_ACTION_ECONOMY_SOURCE,
  INITIAL_TERRITORY_LIBRARY_SOURCE
]);

function scenario(
  value: Omit<InitialScenarioDefinition, "sources" | "maxFriendlyUnitsPerTerritory" | "deployToLegalCapacity" | "executableStatus">
): InitialScenarioDefinition {
  return Object.freeze({
    ...value,
    maxFriendlyUnitsPerTerritory: 3,
    deployToLegalCapacity: true,
    executableStatus: "deployment-structure-only" as const,
    sources: SOURCES
  });
}

function territorySlot(id: string, name: string): ScenarioTerritorySlot {
  return Object.freeze({
    id,
    name,
    territoryDefinitionId: resolveInitialTerritoryId(name)
  });
}

export const INITIAL_SCENARIOS: readonly InitialScenarioDefinition[] = Object.freeze([
  scenario({
    id: "point-of-domination",
    name: "Point of Domination",
    role: "Baseline competitive scenario and control case for testing.",
    gameSize: "small",
    territoryCount: { min: 4, max: 4 },
    armyPoints: { min: 9, max: 12 },
    vpThreshold: 10,
    roundLimit: 4,
    territorySlots: [
      territorySlot("T1", "IW Stronghold"),
      territorySlot("T2", "Objective"),
      territorySlot("T3", "Objective"),
      territorySlot("T4", "FB Stronghold")
    ],
    startingSlotIdsByFaction: {
      [IRON_WAKE_FACTION_ID]: ["T1", "T2"],
      [FATEBOUND_FACTION_ID]: ["T3", "T4"]
    },
    startingTokens: [],
    territoryAbilities: ["Use standard Stronghold and Objective abilities."],
    relevantUnitInteractions: [],
    victoryRules: [
      "Standard Strikeforce30 VP rules: Kill VP, Territory VP, and territory effects.",
      "End the game after the active round when the threshold is reached or exceeded.",
      "Highest VP wins."
    ],
    designGoal: "Use this as the baseline when comparing new mechanics or balance changes.",
    primaryMechanics: ["core game"]
  }),
  scenario({
    id: "signal-in-the-fog",
    name: "Signal in the Fog",
    role: "Introduces Smoke without changing the core scoring model.",
    gameSize: "small",
    territoryCount: { min: 4, max: 4 },
    armyPoints: { min: 9, max: 12 },
    vpThreshold: 10,
    roundLimit: 4,
    territorySlots: [
      territorySlot("T1", "IW Stronghold"),
      territorySlot("T2", "Fog Basin"),
      territorySlot("T3", "Command Relay"),
      territorySlot("T4", "FB Stronghold")
    ],
    startingSlotIdsByFaction: {
      [IRON_WAKE_FACTION_ID]: ["T1", "T2"],
      [FATEBOUND_FACTION_ID]: ["T3", "T4"]
    },
    startingTokens: ["1 Smoke token begins on T2."],
    territoryAbilities: [
      "Fog Basin: candidate Ping/Activate Territory interaction places or repositions Smoke according to final Smoke rules.",
      "Command Relay: candidate territory interaction grants +1 Command."
    ],
    relevantUnitInteractions: [
      "Scouts: suggested future Smoke creation/deployment interaction.",
      "Silencers: suggested future Smoke reposition/manipulation interaction.",
      "Melee/short-range units: suggested covered-approach interaction."
    ],
    victoryRules: ["Standard VP rules."],
    designGoal: "Test whether Smoke changes positioning without slowing the game.",
    primaryMechanics: ["smoke"]
  }),
  scenario({
    id: "minefield-run",
    name: "Minefield Run",
    role: "Movement-pressure scenario.",
    gameSize: "medium",
    territoryCount: { min: 5, max: 5 },
    armyPoints: { min: 15, max: 15 },
    vpThreshold: 15,
    roundLimit: 5,
    territorySlots: [
      territorySlot("T1", "IW Stronghold"),
      territorySlot("T2", "Wasteland"),
      territorySlot("T3", "Central Objective"),
      territorySlot("T4", "Minefield"),
      territorySlot("T5", "FB Stronghold")
    ],
    startingSlotIdsByFaction: {
      [IRON_WAKE_FACTION_ID]: ["T1", "T2"],
      [FATEBOUND_FACTION_ID]: ["T4", "T5"]
    },
    startingTokens: [
      "Recommended first test: 1 Mine in or near the Iron Wake approach.",
      "Recommended first test: 1 Mine in or near the Fatebound approach.",
      "Do not use hidden placement unless hidden information is explicitly supported."
    ],
    territoryAbilities: [
      "Wasteland: candidate movement/hazard interaction.",
      "Central Objective: standard VP or Command interaction.",
      "Minefield: candidate territory interaction places a Mine here or in an adjacent legal territory."
    ],
    relevantUnitInteractions: [
      "Spikemites: suggested Infest/Mine interaction.",
      "Scouts: suggested bypass/mitigation interaction.",
      "Mobile units: suggested alternate-movement benefit."
    ],
    victoryRules: ["Standard VP rules."],
    designGoal: "Make route selection matter without creating a memory-heavy trap system.",
    primaryMechanics: ["mine", "movement pressure"]
  }),
  scenario({
    id: "breach-the-line",
    name: "Breach the Line",
    role: "Asymmetric attacker/defender scenario testing fortification and Blast.",
    gameSize: "medium",
    territoryCount: { min: 5, max: 5 },
    armyPoints: { min: 15, max: 15 },
    vpThreshold: 15,
    roundLimit: 5,
    territorySlots: [
      territorySlot("T1", "IW Entry"),
      territorySlot("T2", "Ruined Approach"),
      territorySlot("T3", "Munitions Depot"),
      territorySlot("T4", "Fortification"),
      territorySlot("T5", "FB Stronghold")
    ],
    startingSlotIdsByFaction: {
      [IRON_WAKE_FACTION_ID]: ["T1", "T2"],
      [FATEBOUND_FACTION_ID]: ["T4", "T5"]
    },
    startingTokens: [
      "Fortification/Dig In access on T4.",
      "Optional Blast-ready marker on T3."
    ],
    territoryAbilities: [
      "Munitions Depot: candidate territory interaction places Blast on an eligible adjacent territory.",
      "Fortification: candidate Dig In access."
    ],
    relevantUnitInteractions: [
      "Enforcers: suggested Breach Charge interaction.",
      "Omnicore Bombard: suggested ranged Blast interaction.",
      "Defensive units: suggested Dig In interaction.",
      "Heavy units: direct breach pressure."
    ],
    victoryRules: [
      "Default test: standard VP scoring.",
      "Attacker gains bonus VP for controlling T4 at end of round; defender gains bonus VP for retaining T4.",
      "Alternative test: holding T4 uncontested for two Scoring steps grants a scenario bonus."
    ],
    designGoal: "Test asymmetric geography without reducing starting activation count.",
    primaryMechanics: ["blast", "dig in", "asymmetric geography"]
  }),
  scenario({
    id: "extraction-corridor",
    name: "Extraction Corridor",
    role: "Movement and objective-transport scenario.",
    gameSize: "medium",
    territoryCount: { min: 5, max: 5 },
    armyPoints: { min: 15, max: 15 },
    vpThreshold: 15,
    roundLimit: 5,
    territorySlots: [
      territorySlot("T1", "IW Stronghold"),
      territorySlot("T2", "Fog Basin"),
      territorySlot("T3", "Extraction Site"),
      territorySlot("T4", "Wasteland"),
      territorySlot("T5", "FB Stronghold")
    ],
    startingSlotIdsByFaction: {
      [IRON_WAKE_FACTION_ID]: ["T1", "T2"],
      [FATEBOUND_FACTION_ID]: ["T4", "T5"]
    },
    startingTokens: ["1 Extraction Objective begins on T3."],
    territoryAbilities: [
      "Fog Basin: candidate Smoke interaction.",
      "Extraction Site: scenario-objective interaction.",
      "Wasteland: candidate Hazard/Mine interaction."
    ],
    relevantUnitInteractions: [
      "A controlling unit may spend its activation to secure the Extraction Objective; final carry/escort rules remain unresolved."
    ],
    victoryRules: [
      "Normal VP remains active.",
      "Successful extraction grants a meaningful VP bonus.",
      "The objective should matter enough that destruction alone is not always optimal."
    ],
    designGoal: "Create a battle about direction and movement instead of static occupation.",
    primaryMechanics: ["objective transport", "movement"]
  }),
  scenario({
    id: "stronghold-assault",
    name: "Stronghold Assault",
    role: "Siege scenario using a targetable territory with Health.",
    gameSize: "medium",
    territoryCount: { min: 5, max: 5 },
    armyPoints: { min: 15, max: 15 },
    vpThreshold: null,
    roundLimit: 5,
    territorySlots: [
      territorySlot("T1", "IW Entry"),
      territorySlot("T2", "Approach"),
      territorySlot("T3", "Breach Zone"),
      territorySlot("T4", "Fortified Stronghold"),
      territorySlot("T5", "FB Rear Line")
    ],
    startingSlotIdsByFaction: {
      [IRON_WAKE_FACTION_ID]: ["T1", "T2"],
      [FATEBOUND_FACTION_ID]: ["T4", "T5"]
    },
    startingTokens: [
      "Stronghold Health tracker on T4.",
      "Optional Fortification/Dig In state.",
      "Optional Blast access through T3."
    ],
    territoryAbilities: [
      "Breach Zone: candidate Blast/Breach Charge interaction.",
      "Fortified Stronghold: candidate defensive/scenario-Health interaction.",
      "Suggested first-test Stronghold values are Health 8 / Defense 3; these are tuning values, not settled canon."
    ],
    relevantUnitInteractions: [],
    victoryRules: [
      "Iron Wake wins immediately if the Stronghold is destroyed.",
      "Fatebound wins if the Stronghold survives through the final round.",
      "Standard VP may be used as a tiebreaker, secondary score, or alternate victory path."
    ],
    designGoal: "Create a genuinely different mission while keeping standard movement, attack, defense, and activation rules.",
    primaryMechanics: ["targetable territory", "siege"]
  }),
  scenario({
    id: "scorched-front",
    name: "Scorched Front",
    role: "Large battlefield emphasizing area denial and forced movement.",
    gameSize: "large",
    territoryCount: { min: 6, max: 6 },
    armyPoints: { min: 20, max: 20 },
    vpThreshold: 20,
    roundLimit: 6,
    territorySlots: [
      territorySlot("T1", "IW Stronghold"),
      territorySlot("T2", "Depot"),
      territorySlot("T3", "Command Relay"),
      territorySlot("T4", "Lava Gate"),
      territorySlot("T5", "Fortification"),
      territorySlot("T6", "FB Stronghold")
    ],
    startingSlotIdsByFaction: {
      [IRON_WAKE_FACTION_ID]: ["T1", "T2"],
      [FATEBOUND_FACTION_ID]: ["T5", "T6"]
    },
    startingTokens: [
      "Recommended: Blast access from T2.",
      "Recommended: Blast or hazard state associated with T4."
    ],
    territoryAbilities: [
      "Depot: candidate Blast creation/support.",
      "Command Relay: candidate Command generation.",
      "Lava Gate: candidate Hazard/Blast interaction.",
      "Fortification: candidate Dig In support."
    ],
    relevantUnitInteractions: [],
    victoryRules: [
      "Standard VP rules.",
      "Optional test bonus: controlling both T3 and T4 at Scoring grants +1 strategic VP."
    ],
    designGoal: "Create a wider front where one local fight cannot solve the whole battle.",
    primaryMechanics: ["blast", "hazard", "wide front"]
  }),
  scenario({
    id: "sector-collapse",
    name: "Sector Collapse",
    role: "Full-system sandbox for experienced players and stress testing.",
    gameSize: "large",
    territoryCount: { min: 6, max: null },
    armyPoints: { min: 20, max: 20 },
    vpThreshold: null,
    roundLimit: 6,
    territorySlots: [
      territorySlot("T1", "IW Stronghold"),
      territorySlot("T2", "No Man's Land"),
      territorySlot("T3", "Objective"),
      territorySlot("T4", "Command Relay"),
      territorySlot("T5", "No Man's Land"),
      territorySlot("T6", "FB Stronghold")
    ],
    startingSlotIdsByFaction: {
      [IRON_WAKE_FACTION_ID]: ["T1", "T2"],
      [FATEBOUND_FACTION_ID]: ["T5", "T6"]
    },
    startingTokens: [
      "Suggested: 1 Mine.",
      "Suggested: 1 Smoke.",
      "Suggested: 1 Blast-ready battlefield source; exact placement must be scenario-defined."
    ],
    territoryAbilities: [
      "Uses the full candidate territory vocabulary: Objective, Stronghold, No Man's Land, Smoke, Mine, Blast, Command generation, and scenario-specific effects."
    ],
    relevantUnitInteractions: [],
    victoryRules: ["Standard VP scoring with optional scenario bonus objectives."],
    designGoal: "Stress-test the complete Strikeforce30 system; not recommended as the first-play scenario.",
    primaryMechanics: ["full sandbox"]
  })
]);

export const INITIAL_SCENARIOS_BY_ID: Readonly<Record<string, InitialScenarioDefinition>> =
  Object.freeze(Object.fromEntries(INITIAL_SCENARIOS.map((definition) => [definition.id, definition])));

export function deriveStartingTerritorySlotCapacity(
  definition: InitialScenarioDefinition,
  factionId: InitialScenarioFactionId
): number {
  return definition.startingSlotIdsByFaction[factionId].length * definition.maxFriendlyUnitsPerTerritory;
}

export function validateInitialScenarioSet(
  scenarios: readonly InitialScenarioDefinition[] = INITIAL_SCENARIOS
): void {
  const ids = new Set<string>();
  for (const definition of scenarios) {
    assertSourcesPresent(definition.sources, `Initial scenario ${definition.id}`);
    if (ids.has(definition.id)) {
      throw new Error(`Initial scenario set contains duplicate id ${definition.id}.`);
    }
    ids.add(definition.id);

    if (definition.territorySlots.length < definition.territoryCount.min) {
      throw new Error(
        `Scenario ${definition.id} provides ${definition.territorySlots.length} example territory slots but requires at least ${definition.territoryCount.min}.`
      );
    }
    if (
      definition.territoryCount.max !== null &&
      definition.territorySlots.length > definition.territoryCount.max
    ) {
      throw new Error(
        `Scenario ${definition.id} provides ${definition.territorySlots.length} territory slots but maximum is ${definition.territoryCount.max}.`
      );
    }

    const slotIds = new Set(definition.territorySlots.map((slot) => slot.id));
    if (slotIds.size !== definition.territorySlots.length) {
      throw new Error(`Scenario ${definition.id} contains duplicate territory slot ids.`);
    }

    for (const slot of definition.territorySlots) {
      if (slot.territoryDefinitionId !== null && !INITIAL_TERRITORIES_BY_ID[slot.territoryDefinitionId]) {
        throw new Error(
          `Scenario ${definition.id} slot ${slot.id} references unknown Territory Library id ${slot.territoryDefinitionId}.`
        );
      }
    }

    for (const factionId of [IRON_WAKE_FACTION_ID, FATEBOUND_FACTION_ID] as const) {
      const startingSlots = definition.startingSlotIdsByFaction[factionId];
      if (startingSlots.length === 0) {
        throw new Error(`Scenario ${definition.id} has no starting slots for ${factionId}.`);
      }
      for (const slotId of startingSlots) {
        if (!slotIds.has(slotId)) {
          throw new Error(
            `Scenario ${definition.id} starting slot ${slotId} for ${factionId} is not in its battlefield.`
          );
        }
      }
    }
  }
}

/** Utility for future adapters that need the two supported faction ids as generic FactionId values. */
export function initialScenarioFactionIds(): readonly FactionId[] {
  return [IRON_WAKE_FACTION_ID, FATEBOUND_FACTION_ID];
}

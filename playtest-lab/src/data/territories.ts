import { assertSourcesPresent } from "../engine/provenance.js";
import type { SourcedDefinition } from "../engine/provenance.js";
import { INITIAL_TERRITORY_LIBRARY_SOURCE } from "../rules/sources.js";

export type TerritoryLibraryClass =
  | "objective"
  | "stronghold"
  | "no-mans-land"
  | "stronghold-objective"
  | "objective-no-mans-land-hybrid";

export type TerritoryLibraryOwnership =
  | "neutral"
  | "iron-wake"
  | "fatebound"
  | "scenario-dependent"
  | "scenario-defender";

export type TerritoryDesignStatus =
  | "core-established-role"
  | "core-baseline"
  | "strong-candidate"
  | "core-functional-role"
  | "proposed-playtest"
  | "proposed-needs-lock"
  | "proposed-strong-candidate"
  | "proposed-scenario-specific"
  | "scenario-terrain"
  | "flexible-family"
  | "thematic-placeholder"
  | "core-template";

export type TerritoryMechanicMaturity =
  | "established"
  | "candidate"
  | "scenario-specific"
  | "unresolved";

export interface InitialTerritoryDefinition extends SourcedDefinition {
  readonly id: string;
  readonly name: string;
  /** Scenario/source spellings that resolve to this reusable territory identity. */
  readonly aliases: readonly string[];
  readonly territoryClass: TerritoryLibraryClass;
  readonly ownership: TerritoryLibraryOwnership;
  readonly battlefieldRole: string;
  readonly description: string;
  readonly coreRules: readonly string[];
  /** Player-facing activation/Ping concept; may be candidate or unresolved. */
  readonly activationText: readonly string[];
  readonly activationMaturity: TerritoryMechanicMaturity;
  readonly scoringText: readonly string[];
  readonly battlefieldStateInteractions: readonly string[];
  readonly scenarioUses: readonly string[];
  readonly designStatus: TerritoryDesignStatus;
  /** Current normal friendly-unit capacity from the rules/library. */
  readonly maxFriendlyUnits: number;
  /** True only where the supplied library establishes normal deployment access. */
  readonly legalSpawnPoint: boolean;
  /**
   * Territory identity/class/capacity and explicitly established deployment role
   * may be consumed now. Candidate abilities remain descriptive until promoted.
   */
  readonly executableStatus: "identity-capacity-and-established-role-only";
}

const SOURCE = Object.freeze([INITIAL_TERRITORY_LIBRARY_SOURCE]);

function territory(
  value: Omit<
    InitialTerritoryDefinition,
    "sources" | "maxFriendlyUnits" | "executableStatus"
  >
): InitialTerritoryDefinition {
  return Object.freeze({
    ...value,
    maxFriendlyUnits: 3,
    executableStatus: "identity-capacity-and-established-role-only" as const,
    sources: SOURCE
  });
}

export const INITIAL_TERRITORIES: readonly InitialTerritoryDefinition[] = Object.freeze([
  territory({
    id: "iron-wake-stronghold",
    name: "Iron Wake Stronghold",
    aliases: ["IW Stronghold"],
    territoryClass: "stronghold",
    ownership: "iron-wake",
    battlefieldRole: "Primary Iron Wake deployment and reinforcement territory.",
    description: "A hardened Iron Wake operational base built around heavy logistics, armored infrastructure, command relays, and rapid battlefield deployment.",
    coreRules: [
      "Legal Iron Wake deployment territory.",
      "Reserve units normally enter through a legal Stronghold unless a unit ability overrides this.",
      "Maximum friendly-unit capacity follows normal territory rules."
    ],
    activationText: ["Current baseline concept: gain +1 Command."],
    activationMaturity: "candidate",
    scoringText: ["Standard control scoring unless the scenario overrides it."],
    battlefieldStateInteractions: [],
    scenarioUses: ["Point of Domination", "Signal in the Fog", "Minefield Run", "Extraction Corridor", "Scorched Front", "Sector Collapse"],
    designStatus: "core-established-role",
    legalSpawnPoint: true
  }),
  territory({
    id: "fatebound-stronghold",
    name: "Fatebound Stronghold",
    aliases: ["FB Stronghold"],
    territoryClass: "stronghold",
    ownership: "fatebound",
    battlefieldRole: "Primary Fatebound deployment and reinforcement territory.",
    description: "A fortified Fatebound military position combining command infrastructure, ritualized faction identity, defensive architecture, and battlefield coordination.",
    coreRules: [
      "Legal Fatebound deployment territory.",
      "Reserve units normally enter through a legal Stronghold unless an ability overrides this.",
      "Maximum friendly-unit capacity follows normal territory rules."
    ],
    activationText: ["Current baseline concept: gain +1 Command."],
    activationMaturity: "candidate",
    scoringText: ["Standard control scoring unless the scenario overrides it."],
    battlefieldStateInteractions: [],
    scenarioUses: ["Point of Domination", "Signal in the Fog", "Minefield Run", "Breach the Line", "Extraction Corridor", "Scorched Front", "Sector Collapse"],
    designStatus: "core-established-role",
    legalSpawnPoint: true
  }),
  territory({
    id: "standard-objective",
    name: "Standard Objective",
    aliases: ["Objective"],
    territoryClass: "objective",
    ownership: "neutral",
    battlefieldRole: "Basic contested scoring location.",
    description: "A strategically valuable location without a specialized battlefield effect.",
    coreRules: ["Uses standard Objective Control."],
    activationText: ["May grant VP, Command, or another simple baseline effect depending on the production ruleset."],
    activationMaturity: "unresolved",
    scoringText: ["Standard territory VP."],
    battlefieldStateInteractions: [],
    scenarioUses: ["Point of Domination", "baseline playtests", "rules validation"],
    designStatus: "core-baseline",
    legalSpawnPoint: false
  }),
  territory({
    id: "command-relay",
    name: "Command Relay",
    aliases: [],
    territoryClass: "objective",
    ownership: "neutral",
    battlefieldRole: "Command-economy territory.",
    description: "A communications installation that links ground forces to wider tactical command.",
    coreRules: ["Uses standard Objective Control."],
    activationText: ["Network Uplink / Command Relay: once per round, the controller gains +1 Command when this territory is successfully activated."],
    activationMaturity: "candidate",
    scoringText: ["Standard control scoring unless scenario-specific."],
    battlefieldStateInteractions: [],
    scenarioUses: ["Signal in the Fog", "Scorched Front", "Sector Collapse"],
    designStatus: "strong-candidate",
    legalSpawnPoint: false
  }),
  territory({
    id: "central-objective",
    name: "Central Objective",
    aliases: [],
    territoryClass: "objective",
    ownership: "neutral",
    battlefieldRole: "Primary central scoring pressure.",
    description: "A strategically important central battlefield position designed to pull both players toward the same contested space.",
    coreRules: ["Uses standard Objective Control."],
    activationText: ["Prefer a simple VP or Command effect."],
    activationMaturity: "candidate",
    scoringText: ["Primary standard territory scoring."],
    battlefieldStateInteractions: ["Scenario dependent."],
    scenarioUses: ["Minefield Run", "general medium scenarios"],
    designStatus: "core-functional-role",
    legalSpawnPoint: false
  }),
  territory({
    id: "fog-basin",
    name: "Fog Basin",
    aliases: [],
    territoryClass: "no-mans-land",
    ownership: "neutral",
    battlefieldRole: "Smoke generation and ranged-combat disruption.",
    description: "A low-visibility battlefield region filled with natural or artificial concealment.",
    coreRules: ["Normal movement unless scenario rules modify it."],
    activationText: ["Proposed Smoke Control: place a Smoke token in this territory or reposition an eligible Smoke token; exact range and placement remain under test."],
    activationMaturity: "candidate",
    scoringText: ["Usually low or scenario-specific strategic value.", "No Man's Land should generally not become a high-value scoring location without a scenario reason."],
    battlefieldStateInteractions: ["Smoke: suggested baseline is -1 Shoot when shooting into or through the territory; public information."],
    scenarioUses: ["Signal in the Fog", "Extraction Corridor"],
    designStatus: "proposed-playtest",
    legalSpawnPoint: false
  }),
  territory({
    id: "wasteland",
    name: "Wasteland",
    aliases: [],
    territoryClass: "no-mans-land",
    ownership: "neutral",
    battlefieldRole: "Dangerous traversal and Mine/hazard interaction.",
    description: "Destroyed, unstable ground where movement itself creates tactical risk.",
    coreRules: ["Designed to create movement pressure rather than direct scoring pressure."],
    activationText: ["Possible interactions: clear, move, or create routes around Mines/hazards; final activation rule is not locked."],
    activationMaturity: "unresolved",
    scoringText: ["Normally low or none unless scenario-defined."],
    battlefieldStateInteractions: ["Mine / hazard interaction."],
    scenarioUses: ["Minefield Run", "Extraction Corridor"],
    designStatus: "proposed-needs-lock",
    legalSpawnPoint: false
  }),
  territory({
    id: "minefield-control",
    name: "Minefield Control",
    aliases: ["Minefield"],
    territoryClass: "no-mans-land",
    ownership: "neutral",
    battlefieldRole: "Movement denial and route control.",
    description: "An engineered or improvised mine-control zone where possession lets a faction shape enemy movement.",
    coreRules: ["Standard Objective Control may determine who can use the ability."],
    activationText: ["Suggested Place Mine: place a Mine token in this territory or an adjacent legal territory; exact restrictions remain under test."],
    activationMaturity: "candidate",
    scoringText: ["Should generally be less important than its movement-control effect."],
    battlefieldStateInteractions: ["Mine: suggested trigger is the first enemy Move or Charge into the territory; exact effect/damage remains under test."],
    scenarioUses: ["Minefield Run", "Sector Collapse variants"],
    designStatus: "proposed-playtest",
    legalSpawnPoint: false
  }),
  territory({
    id: "munitions-depot",
    name: "Munitions Depot",
    aliases: [],
    territoryClass: "objective",
    ownership: "neutral",
    battlefieldRole: "Blast generation and anti-fortification pressure.",
    description: "A battlefield supply depot containing ammunition, demolition charges, targeting systems, or artillery support infrastructure.",
    coreRules: ["Uses standard Objective Control."],
    activationText: ["Suggested Place Blast: place a Blast token on an eligible adjacent territory; exact range remains under test."],
    activationMaturity: "candidate",
    scoringText: ["Standard Objective scoring unless scenario-specific."],
    battlefieldStateInteractions: ["Blast: suggested Scoring behavior forces remaining units to Fall Back or suffer 1 Wound, then removes Blast."],
    scenarioUses: ["Breach the Line", "Scorched Front"],
    designStatus: "proposed-strong-candidate",
    legalSpawnPoint: false
  }),
  territory({
    id: "fortification",
    name: "Fortification",
    aliases: [],
    territoryClass: "stronghold-objective",
    ownership: "scenario-dependent",
    battlefieldRole: "Defensive position supporting Dig In.",
    description: "A reinforced military position designed to hold ground against direct assault.",
    coreRules: ["May be neutral or faction-controlled depending on scenario."],
    activationText: ["Suggested Dig In Support: units here may use or improve the Dig In action/effect."],
    activationMaturity: "candidate",
    scoringText: ["Scenario dependent."],
    battlefieldStateInteractions: ["Dig In: suggested baseline +2 DEF but 0 Objective Control."],
    scenarioUses: ["Breach the Line", "Scorched Front"],
    designStatus: "proposed-playtest",
    legalSpawnPoint: false
  }),
  territory({
    id: "fortified-stronghold",
    name: "Fortified Stronghold",
    aliases: [],
    territoryClass: "stronghold",
    ownership: "scenario-defender",
    battlefieldRole: "Targetable siege objective.",
    description: "A major defensive installation whose destruction or survival is itself the scenario objective.",
    coreRules: ["May have Health, Defense, faction ownership, deployment access, and defensive abilities; exact values are scenario-specific."],
    activationText: ["Scenario-specific; possible concepts include Dig In support, Command generation, repair, defensive fire, and reinforcement support."],
    activationMaturity: "scenario-specific",
    scoringText: ["May replace normal territory scoring with scenario victory conditions."],
    battlefieldStateInteractions: ["Dig In", "Blast"],
    scenarioUses: ["Stronghold Assault"],
    designStatus: "proposed-scenario-specific",
    legalSpawnPoint: false
  }),
  territory({
    id: "ruined-approach",
    name: "Ruined Approach",
    aliases: [],
    territoryClass: "no-mans-land",
    ownership: "neutral",
    battlefieldRole: "Exposed approach into a fortified position.",
    description: "A damaged route toward a defended objective.",
    coreRules: ["Should create exposure or positioning pressure without excessive rules overhead."],
    activationText: ["None required; possible future interactions include Smoke, Charge, defense, or retreat."],
    activationMaturity: "unresolved",
    scoringText: ["Usually not a primary scoring territory."],
    battlefieldStateInteractions: ["Smoke", "Blast", "suppressive effects"],
    scenarioUses: ["Breach the Line"],
    designStatus: "scenario-terrain",
    legalSpawnPoint: false
  }),
  territory({
    id: "breach-zone",
    name: "Breach Zone",
    aliases: [],
    territoryClass: "objective-no-mans-land-hybrid",
    ownership: "neutral",
    battlefieldRole: "Transition point between attacker and fortified defender.",
    description: "A compromised section of defensive infrastructure where attackers can create or exploit openings.",
    coreRules: ["Should interact directly with siege mechanics."],
    activationText: ["Possible: enable or improve Breach Charge / Blast placement against the defended Stronghold."],
    activationMaturity: "candidate",
    scoringText: ["Usually secondary to the scenario objective."],
    battlefieldStateInteractions: ["Blast", "Breach", "Fortification"],
    scenarioUses: ["Stronghold Assault"],
    designStatus: "proposed-scenario-specific",
    legalSpawnPoint: false
  }),
  territory({
    id: "extraction-site",
    name: "Extraction Site",
    aliases: [],
    territoryClass: "objective",
    ownership: "neutral",
    battlefieldRole: "Scenario-objective pickup or interaction point.",
    description: "A location containing something valuable that must be secured and moved.",
    coreRules: ["Normal Objective Control may determine whether a unit can interact with the objective."],
    activationText: ["Suggested: secure or interact with the Extraction Objective; final transport/carry rule remains unresolved."],
    activationMaturity: "unresolved",
    scoringText: ["The territory may score normally, but the carried objective should be the main scenario value."],
    battlefieldStateInteractions: ["Scenario dependent."],
    scenarioUses: ["Extraction Corridor"],
    designStatus: "proposed-scenario-specific",
    legalSpawnPoint: false
  }),
  territory({
    id: "depot",
    name: "Depot",
    aliases: [],
    territoryClass: "objective",
    ownership: "neutral",
    battlefieldRole: "Generic logistics / battlefield supply location.",
    description: "A forward supply installation supporting ammunition, repairs, and local operational reach.",
    coreRules: [],
    activationText: ["Scenario-dependent possibilities include Command, Blast, battlefield-token manipulation, or reinforcement support."],
    activationMaturity: "scenario-specific",
    scoringText: ["Standard Objective scoring."],
    battlefieldStateInteractions: ["Blast", "Command"],
    scenarioUses: ["Scorched Front", "logistics-focused future scenarios"],
    designStatus: "flexible-family",
    legalSpawnPoint: false
  }),
  territory({
    id: "lava-gate",
    name: "Lava Gate",
    aliases: [],
    territoryClass: "no-mans-land",
    ownership: "neutral",
    battlefieldRole: "Environmental hazard and forced-movement pressure.",
    description: "A highly dangerous transit region shaped by extreme environmental conditions.",
    coreRules: ["Designed to make remaining in the territory dangerous."],
    activationText: ["Possible: place/refresh Blast or trigger an environmental hazard."],
    activationMaturity: "candidate",
    scoringText: ["Generally not a high-value scoring territory."],
    battlefieldStateInteractions: ["Blast", "forced movement", "environmental damage"],
    scenarioUses: ["Scorched Front"],
    designStatus: "thematic-placeholder",
    legalSpawnPoint: false
  }),
  territory({
    id: "generic-no-mans-land",
    name: "No Man's Land — Generic",
    aliases: ["No Man's Land"],
    territoryClass: "no-mans-land",
    ownership: "neutral",
    battlefieldRole: "Generic dangerous traversal territory for modular scenario generation.",
    description: "A flexible territory shell used when a scenario requires dangerous ground without a bespoke named location.",
    coreRules: ["Scenario-defined."],
    activationText: ["Scenario-defined."],
    activationMaturity: "scenario-specific",
    scoringText: ["Normally low or none."],
    battlefieldStateInteractions: ["Smoke", "Mine", "Blast", "movement penalties", "exposure"],
    scenarioUses: ["Sector Collapse", "procedural scenario generation"],
    designStatus: "core-template",
    legalSpawnPoint: false
  })
]);

export const INITIAL_TERRITORIES_BY_ID: Readonly<Record<string, InitialTerritoryDefinition>> =
  Object.freeze(Object.fromEntries(INITIAL_TERRITORIES.map((definition) => [definition.id, definition])));

export const INITIAL_TERRITORY_ID_BY_NAME_OR_ALIAS: Readonly<Record<string, string>> =
  Object.freeze(Object.fromEntries(
    INITIAL_TERRITORIES.flatMap((definition) =>
      [definition.name, ...definition.aliases].map((name) => [name.toLowerCase(), definition.id] as const)
    )
  ));

export function resolveInitialTerritoryId(name: string): string | null {
  return INITIAL_TERRITORY_ID_BY_NAME_OR_ALIAS[name.trim().toLowerCase()] ?? null;
}

export function validateInitialTerritoryLibrary(
  territories: readonly InitialTerritoryDefinition[] = INITIAL_TERRITORIES
): void {
  const ids = new Set<string>();
  const namesAndAliases = new Map<string, string>();

  for (const definition of territories) {
    assertSourcesPresent(definition.sources, `Initial territory ${definition.id}`);
    if (ids.has(definition.id)) {
      throw new Error(`Initial territory library contains duplicate id ${definition.id}.`);
    }
    ids.add(definition.id);

    if (!Number.isInteger(definition.maxFriendlyUnits) || definition.maxFriendlyUnits <= 0) {
      throw new Error(`Territory ${definition.id} must have a positive integer friendly-unit capacity.`);
    }

    for (const candidate of [definition.name, ...definition.aliases]) {
      const normalized = candidate.trim().toLowerCase();
      if (!normalized) {
        throw new Error(`Territory ${definition.id} contains a blank name or alias.`);
      }
      const prior = namesAndAliases.get(normalized);
      if (prior && prior !== definition.id) {
        throw new Error(`Territory name/alias ${candidate} resolves to both ${prior} and ${definition.id}.`);
      }
      namesAndAliases.set(normalized, definition.id);
    }
  }
}

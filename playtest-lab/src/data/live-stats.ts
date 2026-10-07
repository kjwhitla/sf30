import type { FactionDefinition } from "./types.js";
import type { FactionId, UnitDefinition } from "../engine/types.js";
import { LIVE_STATS_SOURCE, LIVE_WORKING_RULES_SOURCE } from "../rules/sources.js";

/** Raw metadata retained from the two current experimental v2 Live Stats tabs. */
export interface LiveStatsUnitDefinition extends UnitDefinition {
  readonly sourceSheet: "experimental IRON WAKE v2" | "experimental FATEBOUND v2";
  readonly sourceRow: number;
  /** Unnamed leading boolean column from the source sheet; semantics intentionally not inferred. */
  readonly sourceFlag: boolean;
  readonly abilityName: string | null;
  readonly abilityType: string | null;
  readonly tacticalText: string | null;
  readonly strategicText: string | null;
}

export const LIVE_STATS_FACTIONS: Readonly<Record<FactionId, FactionDefinition>> = Object.freeze({
  "iron-wake": Object.freeze({ id: "iron-wake", name: "Iron Wake", sources: [LIVE_STATS_SOURCE] }),
  fatebound: Object.freeze({ id: "fatebound", name: "Fatebound", sources: [LIVE_STATS_SOURCE] })
});

const SOURCES = Object.freeze([LIVE_STATS_SOURCE, LIVE_WORKING_RULES_SOURCE]);

function movementFor(unitClass: string): number {
  return unitClass === "Vehicle" ? 2 : 1;
}

function destroyedVictoryPointsFor(unitClass: string): number {
  return unitClass.trim().toUpperCase() === "LEADER" ? 3 : 1;
}

function unit(value: Omit<LiveStatsUnitDefinition, "stats" | "sources"> & {
  readonly health: number; readonly shoot: number | null; readonly melee: number | null;
  readonly defense: number | null; readonly objectiveControl: number | null;
}): LiveStatsUnitDefinition {
  const { health, shoot, melee, defense, objectiveControl, ...rest } = value;
  return Object.freeze({
    ...rest,
    destroyedVictoryPoints: destroyedVictoryPointsFor(rest.unitClass),
    stats: Object.freeze({ health, shoot, melee, defense, objectiveControl, movement: movementFor(rest.unitClass) }),
    sources: SOURCES
  });
}

export const LIVE_STATS_UNITS: readonly LiveStatsUnitDefinition[] = Object.freeze([
  unit({
    id: "iron-wake-iron-captain", name: "Iron Captain", factionId: "iron-wake", unitClass: "Leader",
    stars: null, flags: null,
    health: 4, shoot: 5, melee: 3, defense: 5, objectiveControl: 2,
    abilityText: "Adjacent ALLIED units gain +1 OC (Two adjacent allied units gain +1 OC?)", onDeathText: "Gain 2 CP",
    sourceSheet: "experimental IRON WAKE v2", sourceRow: 9, sourceFlag: true,
    abilityName: "Command Aura", abilityType: "Ongoing", tacticalText: "1. Move / Shoot\n2. Melee / Charge", strategicText: "1. Target allies +1 OC\n2. Move 1 alled unit"
  }),
  unit({
    id: "iron-wake-oracle-of-fate", name: "Oracle of Fate", factionId: "iron-wake", unitClass: "Leader",
    stars: null, flags: null,
    health: 3, shoot: 2, melee: 4, defense: 3, objectiveControl: 2,
    abilityText: "Spend 1 CP and roll 1d6 — on a 1+ to NEGATE one ATTACK action", onDeathText: "Gain 1 CP",
    sourceSheet: "experimental IRON WAKE v2", sourceRow: 10, sourceFlag: false,
    abilityName: "Force Barrier", abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "iron-wake-chaplain", name: "Chaplain", factionId: "iron-wake", unitClass: "Leader",
    stars: null, flags: null,
    health: 3, shoot: 1, melee: 3, defense: 3, objectiveControl: 1,
    abilityText: "ALL enemy units in adjacent and same territories, -1 to DEF roll RESULT in MELEE", onDeathText: "Gain 1 CP",
    sourceSheet: "experimental IRON WAKE v2", sourceRow: 11, sourceFlag: false,
    abilityName: "Behind Enemy Lines", abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "iron-wake-enforcers", name: "Enforcers", factionId: "iron-wake", unitClass: "Troop",
    stars: null, flags: null,
    health: 2, shoot: 4, melee: 2, defense: 3, objectiveControl: 1,
    abilityText: "1+ DEF when HOLDING an OBJECTIVE territory", onDeathText: "You may immediately DEPLOY a unit from RESERVES (to this territory?)",
    sourceSheet: "experimental IRON WAKE v2", sourceRow: 12, sourceFlag: true,
    abilityName: "Hold the Line", abilityType: "Ongoing", tacticalText: "1. Move → Shoot \n2. Melee / Charge", strategicText: "1. +1 DEF & +1 OC\n2. +2 DEF"
  }),
  unit({
    id: "iron-wake-chain-blades", name: "Chain Blades", factionId: "iron-wake", unitClass: "Troop",
    stars: null, flags: null,
    health: 2, shoot: 2, melee: 5, defense: 3, objectiveControl: 1,
    abilityText: "CHARGE action rolls 1d6 TWICE, taking the HIGHEST roll result", onDeathText: "Roll 1d6 — on a 1+, deal 1DMG to attacking unit if on the SAME territory",
    sourceSheet: "experimental IRON WAKE v2", sourceRow: 13, sourceFlag: true,
    abilityName: "Fury Unleashed", abilityType: "Ongoing", tacticalText: "1. Melee → Move\n2. Charge", strategicText: "1. +1 DEF & +1 OC\n2. Move & +1 DEF"
  }),
  unit({
    id: "iron-wake-scouts", name: "Scouts", factionId: "iron-wake", unitClass: "Troop",
    stars: null, flags: null,
    health: 1, shoot: 2, melee: 1, defense: 2, objectiveControl: 1,
    abilityText: "May DEPLOY on ANY available territory", onDeathText: "Roll 1d6 — on a 2, deal 1DMG to an enemy unit on the SAME territory",
    sourceSheet: "experimental IRON WAKE v2", sourceRow: 14, sourceFlag: false,
    abilityName: "Scouting Advance", abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "iron-wake-steel-turrets", name: "Steel Turrets", factionId: "iron-wake", unitClass: "Elite",
    stars: null, flags: null,
    health: 3, shoot: 5, melee: 2, defense: 4, objectiveControl: 2,
    abilityText: "During a Dig in Action, you may instead take 1 CP", onDeathText: "You may PUSH your ALLIED units 1 territory (maybe +1 def to an allied unit)",
    sourceSheet: "experimental IRON WAKE v2", sourceRow: 15, sourceFlag: false,
    abilityName: "Power Armor Bulwark", abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "iron-wake-royal-guard", name: "Royal Guard", factionId: "iron-wake", unitClass: "Elite",
    stars: null, flags: null,
    health: 4, shoot: 2, melee: 6, defense: 5, objectiveControl: 2,
    abilityText: "During MELEE, resolve 3 COMBAT ROUNDS instead of 2", onDeathText: "If destroyed in MELEE, resolve a FINAL STRIKE against attacking enemy unit",
    sourceSheet: "experimental IRON WAKE v2", sourceRow: 16, sourceFlag: false,
    abilityName: "Shield Wall", abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "iron-wake-shadow-ops", name: "Shadow Ops", factionId: "iron-wake", unitClass: "Elite",
    stars: null, flags: null,
    health: 2, shoot: 2, melee: 4, defense: 3, objectiveControl: 1,
    abilityText: "When an enemy moves into the same zone, you may MOVE this unit", onDeathText: "Each enemy unit rolls 1d6, on a 1+ = 1dmg",
    sourceSheet: "experimental IRON WAKE v2", sourceRow: 17, sourceFlag: false,
    abilityName: "Forward Deployment (Tactical Retreat)", abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "iron-wake-ammotech", name: "Ammotech", factionId: "iron-wake", unitClass: "Support",
    stars: null, flags: null,
    health: 2, shoot: 4, melee: 2, defense: 3, objectiveControl: 1,
    abilityText: "Add +1 SHOOTING ito adjacent units (2 adjacent allied units gain +1 shoot?)", onDeathText: "Next ALLIED unit shooting action gains +1 shoot (target allied unit gains +1 shoot)",
    sourceSheet: "experimental IRON WAKE v2", sourceRow: 18, sourceFlag: false,
    abilityName: "Supporting Fire", abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "iron-wake-biomedic", name: "Biomedic", factionId: "iron-wake", unitClass: "Support",
    stars: null, flags: null,
    health: 2, shoot: 1, melee: 2, defense: 2, objectiveControl: 1,
    abilityText: "REMOVE a -1 TOKEN from a NON-VEHICLE allied unit in adjacent or same territory", onDeathText: "REMOVE a -1 TOKEN from a NON-VEHICLE allied unit in ANY territory",
    sourceSheet: "experimental IRON WAKE v2", sourceRow: 19, sourceFlag: false,
    abilityName: "Field Surgeon", abilityType: "Action", tacticalText: null, strategicText: null
  }),
  unit({
    id: "iron-wake-iron-stallions", name: "Iron Stallions", factionId: "iron-wake", unitClass: "Vehicle",
    stars: null, flags: null,
    health: 2, shoot: 3, melee: 4, defense: 3, objectiveControl: 1,
    abilityText: "This unit may be DEPLOYED up to 2 TERRITORIES away from your STRONGHOLD", onDeathText: "You may MOVE another ALLIED unit immediately, if able",
    sourceSheet: "experimental IRON WAKE v2", sourceRow: 20, sourceFlag: false,
    abilityName: "Flanking Rush", abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "iron-wake-iron-mule", name: "Iron Mule", factionId: "iron-wake", unitClass: "Vehicle",
    stars: null, flags: null,
    health: 3, shoot: 2, melee: 2, defense: 5, objectiveControl: 1,
    abilityText: "Can CARRY 1 TROOP or ELITE allied unit Carried unit can't be targeted", onDeathText: "Carried unit UNLOADS and may SHOOT, if able",
    sourceSheet: "experimental IRON WAKE v2", sourceRow: 21, sourceFlag: false,
    abilityName: "Embark", abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "iron-wake-iron-titan", name: "Iron Titan", factionId: "iron-wake", unitClass: "Vehicle",
    stars: null, flags: null,
    health: 6, shoot: 6, melee: 4, defense: 5, objectiveControl: 3,
    abilityText: "Once per activation, spend 2 CP to perform 2 ACTIONS this turn", onDeathText: "Roll 1d6 — on a 1+, deal 1DMG to ALL adjacent and same territory units",
    sourceSheet: "experimental IRON WAKE v2", sourceRow: 22, sourceFlag: false,
    abilityName: "Walking Arsenal", abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "fatebound-gate-baron", name: "Gate Baron", factionId: "fatebound", unitClass: "Leader",
    stars: null, flags: null,
    health: 3, shoot: 3, melee: 5, defense: 5, objectiveControl: 2,
    abilityText: "Once per round, place a DESTROYED unit 3 POWER or less into your RESERVES", onDeathText: "Gain +1 CP",
    sourceSheet: "experimental FATEBOUND v2", sourceRow: 9, sourceFlag: true,
    abilityName: "Resurrection Protocol", abilityType: "Ongoing", tacticalText: "1. Move / Shoot\n2. Melee / Charge", strategicText: "1. Push target allied unit\n2. Destroyed unit <=3 into reserves"
  }),
  unit({
    id: "fatebound-fatevoyant", name: "Fatevoyant", factionId: "fatebound", unitClass: "Leader",
    stars: null, flags: null,
    health: 3, shoot: 2, melee: 3, defense: 3, objectiveControl: 2,
    abilityText: "Spend 2 CP to UNDO the CURRENT action and DEACTIVATE the active unit", onDeathText: "Gain +1 CP",
    sourceSheet: "experimental FATEBOUND v2", sourceRow: 10, sourceFlag: false,
    abilityName: null, abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "fatebound-gatemancer", name: "Gatemancer", factionId: "fatebound", unitClass: "Leader",
    stars: null, flags: null,
    health: 2, shoot: null, melee: 2, defense: 5, objectiveControl: 2,
    abilityText: "Allied units of POWER 3 or less may instead be BOUND when destroyed", onDeathText: "Gain +1 CP",
    sourceSheet: "experimental FATEBOUND v2", sourceRow: 11, sourceFlag: false,
    abilityName: null, abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "fatebound-immortals", name: "Immortals", factionId: "fatebound", unitClass: "Troop",
    stars: null, flags: null,
    health: 2, shoot: 3, melee: 2, defense: 3, objectiveControl: 1,
    abilityText: "If BOUND, roll 1d6 during the DEPLOY step — on a 1+, this unit is RESTORED", onDeathText: "This unit may be BOUND instead of destroyed (roll to restore next turn, otherwise goes to reserves)",
    sourceSheet: "experimental FATEBOUND v2", sourceRow: 12, sourceFlag: true,
    abilityName: "Metal Feet", abilityType: "Ongoing", tacticalText: "1. Move / Shoot \n2. Melee ", strategicText: "1. Pull adjacent allied unit\n2. +1 DEF"
  }),
  unit({
    id: "fatebound-fatebound", name: "Fatebound", factionId: "fatebound", unitClass: "Troop",
    stars: null, flags: null,
    health: 2, shoot: 3, melee: 2, defense: 3, objectiveControl: 1,
    abilityText: "If shooting a unit in the SAME territory, make an additional SHOOT attack", onDeathText: "Next allied TROOP unit shooting action gains +1 SHOOT (Target allied unit gains +1 SHOOT)",
    sourceSheet: "experimental FATEBOUND v2", sourceRow: 13, sourceFlag: false,
    abilityName: "Gauss Barrage", abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "fatebound-weavers", name: "Weavers", factionId: "fatebound", unitClass: "Troop",
    stars: null, flags: null,
    health: 2, shoot: 5, melee: 1, defense: 2, objectiveControl: 1,
    abilityText: "Wghen an enemy unit moves into the SAME territory, you may PULL this unit", onDeathText: "Roll 2d6 — if a 2 appears, deal 1 DMG to an adjacent enemy unit",
    sourceSheet: "experimental FATEBOUND v2", sourceRow: 14, sourceFlag: false,
    abilityName: "Living Lightning", abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "fatebound-the-hallowed", name: "The Hallowed", factionId: "fatebound", unitClass: "Elite",
    stars: null, flags: null,
    health: 4, shoot: null, melee: 6, defense: 5, objectiveControl: 2,
    abilityText: "Cannot be targeted by enemy units unless in SAME or ADJACENT territory", onDeathText: "Adjacent ALLIED units gain +1 DEF until they are destroyed",
    sourceSheet: "experimental FATEBOUND v2", sourceRow: 15, sourceFlag: false,
    abilityName: "Shielded Advance", abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "fatebound-warpers", name: "Warpers", factionId: "fatebound", unitClass: "Elite",
    stars: null, flags: null,
    health: 3, shoot: 2, melee: 4, defense: 4, objectiveControl: 1,
    abilityText: "Can MOVE anywhere there is an ALLIED unit", onDeathText: "TELEPORT 1 allied TROOP unit to ANY territory with an allied unit, if available",
    sourceSheet: "experimental FATEBOUND v2", sourceRow: 16, sourceFlag: false,
    abilityName: "Phase Shift", abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "fatebound-silencers", name: "Silencers", factionId: "fatebound", unitClass: "Support",
    stars: null, flags: null,
    health: 3, shoot: 5, melee: 1, defense: 2, objectiveControl: 1,
    abilityText: "When shooting, defending unit rolls DEF twice, taking the LOWEST result", onDeathText: "DISABLE 1 adjacent ENEMY unit ABILITY until the end of round",
    sourceSheet: "experimental FATEBOUND v2", sourceRow: 17, sourceFlag: false,
    abilityName: "Hyperphase Shot", abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "fatebound-arbiters", name: "Arbiters", factionId: "fatebound", unitClass: "Support",
    stars: null, flags: null,
    health: 2, shoot: 2, melee: 1, defense: 2, objectiveControl: 1,
    abilityText: "Roll 1d6 — on a 1+, REACTIVATE an allied unit", onDeathText: "Roll 1d6 — DEACTIVATE an adjacent enemy unit",
    sourceSheet: "experimental FATEBOUND v2", sourceRow: 18, sourceFlag: false,
    abilityName: "Technomancer", abilityType: "Action", tacticalText: null, strategicText: null
  }),
  unit({
    id: "fatebound-gatewings", name: "Gatewings", factionId: "fatebound", unitClass: "Vehicle",
    stars: null, flags: null,
    health: 2, shoot: 4, melee: 2, defense: 4, objectiveControl: 1,
    abilityText: "May MOVE and SHOOT in a single ACTION in any order", onDeathText: "PUSH an enemy unit on the SAME territory",
    sourceSheet: "experimental FATEBOUND v2", sourceRow: 19, sourceFlag: true,
    abilityName: "Aerial Sweep", abilityType: "Ongoing", tacticalText: "1. Move & Shoot \n2. Melee / Charge", strategicText: "1. Push allied unit on this territory\n2. +1 DEF"
  }),
  unit({
    id: "fatebound-omnicore", name: "Omnicore", factionId: "fatebound", unitClass: "Vehicle",
    stars: null, flags: null,
    health: 3, shoot: 5, melee: 3, defense: 3, objectiveControl: 1,
    abilityText: "Target adjacent Allied unit gains +1 shoot", onDeathText: "Roll 1d6 — on a 1, deal 1 DMG to ALL adjacent units",
    sourceSheet: "experimental FATEBOUND v2", sourceRow: 20, sourceFlag: false,
    abilityName: "Target Relay", abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "fatebound-fate-barge", name: "Fate Barge", factionId: "fatebound", unitClass: "Vehicle",
    stars: null, flags: null,
    health: 5, shoot: 6, melee: 2, defense: 4, objectiveControl: 3,
    abilityText: "After shooting, if the enemy unit remains, roll 1d6 — on a 1+, PUSH that unit", onDeathText: "Roll 1d6 — on a 1+, deal 2 DMG to HIGHEST OC adjacent enemy unit",
    sourceSheet: "experimental FATEBOUND v2", sourceRow: 21, sourceFlag: false,
    abilityName: "Tesla Barrage", abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
  unit({
    id: "fatebound-spikemites", name: "Spikemites", factionId: "fatebound", unitClass: "Swarm",
    stars: null, flags: null,
    health: 1, shoot: 2, melee: 2, defense: 1, objectiveControl: 1,
    abilityText: "Cannot be targeted by SHOOT actions", onDeathText: "For each SPIKEMITES in the same territory, roll 1d6 — on a 2, this unit is RESTORED",
    sourceSheet: "experimental FATEBOUND v2", sourceRow: 22, sourceFlag: false,
    abilityName: "Objective Leech", abilityType: "Ongoing", tacticalText: null, strategicText: null
  }),
]);

export const LIVE_STATS_UNITS_BY_ID: Readonly<Record<string, LiveStatsUnitDefinition>> = Object.freeze(
  Object.fromEntries(LIVE_STATS_UNITS.map((definition) => [definition.id, definition]))
);

export function validateLiveStatsUnits(units: readonly LiveStatsUnitDefinition[] = LIVE_STATS_UNITS): void {
  const ids = new Set<string>();
  for (const definition of units) {
    if (ids.has(definition.id)) throw new Error(`Duplicate Live Stats unit id ${definition.id}.`);
    ids.add(definition.id);
    if (!LIVE_STATS_FACTIONS[definition.factionId]) throw new Error(`Unknown Live Stats faction ${definition.factionId}.`);
    if (!Number.isInteger(definition.sourceRow) || definition.sourceRow < 9) throw new Error(`Invalid source row for ${definition.id}.`);
    if (definition.stats.health < 1) throw new Error(`Invalid Health for ${definition.id}.`);
    if (definition.stats.movement !== movementFor(definition.unitClass)) throw new Error(`Movement mismatch for ${definition.id}.`);
  }
}

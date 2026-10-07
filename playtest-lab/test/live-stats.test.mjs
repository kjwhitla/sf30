import assert from "node:assert/strict";
import test from "node:test";
import {
  LIVE_STATS_FACTIONS,
  LIVE_STATS_UNITS,
  LIVE_STATS_UNITS_BY_ID,
  validateLiveStatsUnits
} from "../dist/data/live-stats.js";
import { LIVE_STATS_SOURCE, LIVE_WORKING_RULES_SOURCE } from "../dist/rules/sources.js";

test("Live Stats ingest contains both experimental v2 factions and 28 authored unit rows", () => {
  validateLiveStatsUnits();
  assert.equal(Object.keys(LIVE_STATS_FACTIONS).length, 2);
  assert.equal(LIVE_STATS_UNITS.length, 28);
  assert.equal(LIVE_STATS_UNITS.filter((unit) => unit.factionId === "iron-wake").length, 14);
  assert.equal(LIVE_STATS_UNITS.filter((unit) => unit.factionId === "fatebound").length, 14);
});

test("Live Stats applies owner correction for units that cannot Shoot", () => {
  const gatemancer = LIVE_STATS_UNITS_BY_ID["fatebound-gatemancer"];
  const hallowed = LIVE_STATS_UNITS_BY_ID["fatebound-the-hallowed"];
  assert.ok(gatemancer && hallowed);
  assert.equal(gatemancer.stats.shoot, null);
  assert.equal(hallowed.stats.shoot, null);
});

test("movement is joined from the Live Working Version rather than invented from the sheet", () => {
  const scouts = LIVE_STATS_UNITS_BY_ID["iron-wake-scouts"];
  const stallions = LIVE_STATS_UNITS_BY_ID["iron-wake-iron-stallions"];
  assert.ok(scouts && stallions);
  assert.equal(scouts.stats.movement, 1);
  assert.equal(stallions.stats.movement, 2);
  assert.ok(stallions.sources.includes(LIVE_STATS_SOURCE));
  assert.ok(stallions.sources.includes(LIVE_WORKING_RULES_SOURCE));
});

test("Scouts deployment wording is retained as authored data, not silently executed", () => {
  const scouts = LIVE_STATS_UNITS_BY_ID["iron-wake-scouts"];
  assert.ok(scouts);
  assert.equal(scouts.sourceSheet, "experimental IRON WAKE v2");
  assert.equal(scouts.sourceRow, 14);
  assert.equal(scouts.abilityText, "May DEPLOY on ANY available territory");
});

test("unnamed source boolean is retained without assigning gameplay meaning", () => {
  assert.equal(LIVE_STATS_UNITS_BY_ID["iron-wake-iron-captain"]?.sourceFlag, true);
  assert.equal(LIVE_STATS_UNITS_BY_ID["iron-wake-scouts"]?.sourceFlag, false);
  assert.equal(LIVE_STATS_UNITS_BY_ID["fatebound-gatewings"]?.sourceFlag, true);
});


test("Live Stats units inherit sourced default destroyed VP by unit class", () => {
  assert.equal(LIVE_STATS_UNITS_BY_ID["iron-wake-iron-captain"]?.destroyedVictoryPoints, 3);
  assert.equal(LIVE_STATS_UNITS_BY_ID["fatebound-gate-baron"]?.destroyedVictoryPoints, 3);
  assert.equal(LIVE_STATS_UNITS_BY_ID["iron-wake-enforcers"]?.destroyedVictoryPoints, 1);
  assert.equal(LIVE_STATS_UNITS_BY_ID["iron-wake-iron-titan"]?.destroyedVictoryPoints, 1);
});

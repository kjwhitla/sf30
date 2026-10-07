import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_TERRITORIES,
  INITIAL_TERRITORIES_BY_ID,
  resolveInitialTerritoryId,
  validateInitialTerritoryLibrary
} from "../dist/data/territories.js";

test("initial Territory Library contains the 17 supplied reusable territories", () => {
  validateInitialTerritoryLibrary();
  assert.equal(INITIAL_TERRITORIES.length, 17);
  assert.deepEqual(
    INITIAL_TERRITORIES.map((territory) => territory.name),
    [
      "Iron Wake Stronghold",
      "Fatebound Stronghold",
      "Standard Objective",
      "Command Relay",
      "Central Objective",
      "Fog Basin",
      "Wasteland",
      "Minefield Control",
      "Munitions Depot",
      "Fortification",
      "Fortified Stronghold",
      "Ruined Approach",
      "Breach Zone",
      "Extraction Site",
      "Depot",
      "Lava Gate",
      "No Man's Land — Generic"
    ]
  );
});

test("scenario shorthand resolves to stable reusable Territory identities", () => {
  assert.equal(resolveInitialTerritoryId("IW Stronghold"), "iron-wake-stronghold");
  assert.equal(resolveInitialTerritoryId("FB Stronghold"), "fatebound-stronghold");
  assert.equal(resolveInitialTerritoryId("Objective"), "standard-objective");
  assert.equal(resolveInitialTerritoryId("Minefield"), "minefield-control");
  assert.equal(resolveInitialTerritoryId("No Man's Land"), "generic-no-mans-land");
  assert.equal(resolveInitialTerritoryId("IW Entry"), null);
});

test("established Strongholds expose deployment identity without promoting candidate abilities", () => {
  const iw = INITIAL_TERRITORIES_BY_ID["iron-wake-stronghold"];
  const fb = INITIAL_TERRITORIES_BY_ID["fatebound-stronghold"];
  assert.ok(iw && fb);
  assert.equal(iw.legalSpawnPoint, true);
  assert.equal(fb.legalSpawnPoint, true);
  assert.equal(iw.maxFriendlyUnits, 3);
  assert.equal(fb.maxFriendlyUnits, 3);
  assert.equal(iw.activationMaturity, "candidate");
  assert.match(iw.activationText.join(" "), /\+1 Command/);
});

test("prototype battlefield effects remain descriptive rather than executable fields", () => {
  const fog = INITIAL_TERRITORIES_BY_ID["fog-basin"];
  const mine = INITIAL_TERRITORIES_BY_ID["minefield-control"];
  const depot = INITIAL_TERRITORIES_BY_ID["munitions-depot"];
  assert.ok(fog && mine && depot);
  assert.equal(fog.executableStatus, "identity-capacity-and-established-role-only");
  assert.equal(fog.activationMaturity, "candidate");
  assert.equal(mine.activationMaturity, "candidate");
  assert.equal(depot.activationMaturity, "candidate");
  assert.equal("smokeShootPenalty" in fog, false);
  assert.equal("mineDamage" in mine, false);
  assert.equal("blastDamage" in depot, false);
});

test("active Territory data uses approved Command terminology", () => {
  for (const territory of INITIAL_TERRITORIES) {
    const activeText = [
      ...territory.coreRules,
      ...territory.activationText,
      ...territory.scoringText,
      ...territory.battlefieldStateInteractions
    ].join(" ");
    assert.doesNotMatch(activeText, /Command Point|\bCP\b/);
  }
});

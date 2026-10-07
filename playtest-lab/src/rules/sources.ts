import type { RuleSourceRef } from "../engine/provenance.js";

/**
 * Exact source-of-truth identity for the current Strikeforce30 rules.
 *
 * External file identity is intentionally primary. The document's internal
 * heading ("Strikeforce30 - Playtest Rules v2.0") is metadata, not a separate
 * source.
 */
export const LIVE_WORKING_RULES_SOURCE: RuleSourceRef = Object.freeze({
  id: "gdrive:1OgMsGbVe67vlUdnZ2nfrutzmIQhJIb3t7S-49B_JvBQ@35282",
  kind: "rulebook",
  title: "Strikeforce30 - RULES (Live Working Version)",
  version: "Drive revision 35282; internal heading Playtest Rules v2.0",
  locator: "1OgMsGbVe67vlUdnZ2nfrutzmIQhJIb3t7S-49B_JvBQ",
  capturedAt: "2026-10-05"
});

export const LIVE_WORKING_RULES_REVISION = "35282" as const;
export const LIVE_WORKING_RULES_INTERNAL_HEADING =
  "Strikeforce30 - Playtest Rules v2.0" as const;


/**
 * Owner-supplied deployment/action-economy invariant. This is newer than the
 * current Live Working Version for scenario-generation/setup policy and is
 * treated as an explicit owner decision.
 */
export const DEPLOYMENT_ACTION_ECONOMY_SOURCE: RuleSourceRef = Object.freeze({
  id: "owner:deployment-action-economy-invariant:2026-10-05",
  kind: "owner-decision",
  title: "Strikeforce30 Deployment Capacity & Action Economy Invariant",
  version: "2026-10-05",
  locator: "docs/invariants/DEPLOYMENT_ACTION_ECONOMY.md",
  capturedAt: "2026-10-05"
});

/**
 * Owner-supplied initial scenario suite. Scenario structure and starting
 * geometry are accepted as the initial playtest set. Any battlefield-effect
 * mechanics explicitly described as recommended/default/test values remain
 * candidates until separately promoted.
 */
export const INITIAL_SCENARIO_SET_SOURCE: RuleSourceRef = Object.freeze({
  id: "owner:initial-scenario-set:2026-10-05",
  kind: "owner-decision",
  title: "Strikeforce30 Scenario Set",
  version: "2026-10-05 initial set",
  locator: "docs/scenarios/source/strikeforce30_scenarios_original_2026-10-05.md",
  capturedAt: "2026-10-05"
});

/**
 * Owner-supplied initial Territory Library. Territory identity, classes,
 * established deployment roles, and normal three-unit capacity are accepted
 * as reusable battlefield data. Entries explicitly marked proposed, suggested,
 * candidate, placeholder, or scenario-specific remain non-executable mechanics
 * until separately promoted.
 */
export const INITIAL_TERRITORY_LIBRARY_SOURCE: RuleSourceRef = Object.freeze({
  id: "owner:initial-territory-library:2026-10-05",
  kind: "owner-decision",
  title: "Strikeforce30 Territory Library",
  version: "2026-10-05 initial library",
  locator: "docs/territories/source/strikeforce30_territory_library_original_2026-10-05.md",
  capturedAt: "2026-10-05"
});

/**
 * Current authored unit-stat workbook. The active ingest deliberately targets
 * only the two top-level experimental v2 faction tabs; archived/reference tabs
 * are not promoted into the executable catalog.
 */
export const LIVE_STATS_SOURCE: RuleSourceRef = Object.freeze({
  id: "gdrive:1fXDqXgaMIlZu72cApEl2j4eUbfpCk035A9-IO4Q2Npo@2025-11-25T23:27:17.680Z",
  kind: "data-table",
  title: "Strikeforce30 (Live Stats)",
  version: "Drive modified 2025-11-25; experimental IRON WAKE v2 + experimental FATEBOUND v2",
  locator: "1fXDqXgaMIlZu72cApEl2j4eUbfpCk035A9-IO4Q2Npo",
  capturedAt: "2026-10-05"
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  LIVE_WORKING_RULES_INTERNAL_HEADING,
  LIVE_WORKING_RULES_REVISION,
  LIVE_WORKING_RULES_SOURCE
} from "../dist/rules/sources.js";

test("canonical source identity preserves Live Working Version external name", () => {
  assert.equal(LIVE_WORKING_RULES_SOURCE.title, "Strikeforce30 - RULES (Live Working Version)");
  assert.equal(LIVE_WORKING_RULES_REVISION, "35282");
  assert.match(LIVE_WORKING_RULES_SOURCE.version, /35282/);
  assert.equal(LIVE_WORKING_RULES_INTERNAL_HEADING, "Strikeforce30 - Playtest Rules v2.0");
  assert.equal(LIVE_WORKING_RULES_SOURCE.kind, "rulebook");
});

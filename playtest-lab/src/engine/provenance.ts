/**
 * Source metadata attached to encoded rules/content data.
 *
 * The engine must never silently convert an assumption into canon. Any datum
 * that could affect gameplay should be traceable to a source/version or be
 * explicitly marked as a synthetic test fixture.
 */
export type RuleSourceKind =
  | "rulebook"
  | "prototype"
  | "data-table"
  | "owner-decision"
  | "design-artifact"
  | "test-fixture";

export interface RuleSourceRef {
  readonly id: string;
  readonly kind: RuleSourceKind;
  readonly title: string;
  readonly version: string;
  readonly locator?: string;
  readonly capturedAt?: string;
}

export interface SourcedDefinition {
  readonly sources: readonly RuleSourceRef[];
}

export function assertSourcesPresent(
  sources: readonly RuleSourceRef[],
  context: string
): void {
  if (sources.length === 0) {
    throw new Error(`${context} must include at least one provenance source.`);
  }

  for (const source of sources) {
    if (!source.id.trim()) {
      throw new Error(`${context} contains a source with an empty id.`);
    }
    if (!source.title.trim()) {
      throw new Error(`${context} source ${source.id} has an empty title.`);
    }
    if (!source.version.trim()) {
      throw new Error(`${context} source ${source.id} has an empty version.`);
    }
  }
}

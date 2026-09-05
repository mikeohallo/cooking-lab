/**
 * Controlled vocabularies for the Cooking Lab local data model.
 *
 * Each vocabulary is declared once as a frozen tuple and the TypeScript union is
 * derived from it, so the compile-time type and the runtime guard can never
 * disagree. The SQL `CHECK` constraints in `src/data/schema/migrations.ts` are
 * written out literally rather than generated from these tuples — a migration's
 * text must stay frozen once it has run on a device — and
 * `__tests__/migrations.test.ts` asserts the two still agree.
 *
 * These lists are the product model, not a convenience. Nothing may be added to
 * one without a controlled decision: a vocabulary is the vocabulary the kitchen
 * actually uses, and an extra value is a product change wearing a type's
 * clothing.
 *
 * Nothing here refers to users, accounts, roles, policies or synchronisation.
 * Cooking Lab is a single-kitchen notebook held on one device; there is no
 * ownership concept to express, so there is no vocabulary for one.
 */

/**
 * A cook is open while it is being cooked and reviewed once the cook has sat
 * down with it. There is no planning, running, finishing or abandoning state:
 * a cook either still has a review to come, or it has had one.
 */
export const COOK_STATUSES = ['open', 'reviewed'] as const;
export type CookStatus = (typeof COOK_STATUSES)[number];

/**
 * Where a row came from: cooking that happened in the app, or records brought
 * in from outside it.
 *
 * This is emphatically not authorship. Who wrote a finding is `created_by`; a
 * row's provenance says nothing about it. Conflating the two is what makes an
 * assistant's suggestion look like history.
 */
export const PROVENANCES = ['live', 'imported'] as const;
export type Provenance = (typeof PROVENANCES)[number];

/**
 * Timeline entries captured during a cook. Raw evidence — what actually
 * happened, in the order it happened.
 */
export const COOK_EVENT_KINDS = [
  'user_note',
  'assistant_msg',
  'temp',
  'photo',
  'plan',
] as const;
export type CookEventKind = (typeof COOK_EVENT_KINDS)[number];

/**
 * Temperature is metric.
 *
 * A single constant rather than a vocabulary, because there is nothing to
 * choose between: a `temp` event records degrees Celsius. A unit column would
 * invite a second unit, and a second unit is how two readings that look
 * comparable stop being comparable.
 */
export const TEMPERATURE_UNIT = 'celsius' as const;
export type TemperatureUnit = typeof TEMPERATURE_UNIT;

/** The key a `temp` event carries its reading under, in `meta`. */
export const TEMPERATURE_META_KEY = 'celsius' as const;

/**
 * What kind of claim a finding is.
 *
 * The distinction is the point of the product: `observed` is something the cook
 * recorded, `inference` is something the assistant read out of the record, and
 * `knowledge` is general cooking knowledge brought to bear. A screen that shows
 * all three the same way would be lying by layout.
 */
export const FINDING_CLASSES = ['observed', 'inference', 'knowledge'] as const;
export type FindingClass = (typeof FINDING_CLASSES)[number];

/** How sure an inference is. Three levels, because more would be false precision. */
export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/**
 * Review lifecycle shared by findings and lessons.
 *
 * `rejected` is a state, not a deletion: the row is retained so the same
 * proposal is not silently raised again and so the record of what was rejected
 * survives. There is no route back out of it.
 */
export const PROPOSAL_STATUSES = ['proposed', 'approved', 'rejected'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/** Who authored a finding. There are exactly two possible authors. */
export const CREATED_BY_VALUES = ['ai', 'user'] as const;
export type CreatedBy = (typeof CREATED_BY_VALUES)[number];

/** Tag namespaces. `(name, kind)` is unique, so "butter" the ingredient and
 *  "butter" the technique are two different tags. */
export const TAG_KINDS = ['dish', 'ingredient', 'technique', 'equipment'] as const;
export type TagKind = (typeof TAG_KINDS)[number];

/** How far an import has got. `failed` batches are retained. */
export const IMPORT_BATCH_STATUSES = ['processing', 'ready', 'done', 'failed'] as const;
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number];

/** The `schema_meta` keys this build writes. */
export const SCHEMA_META_KEYS = ['schema_version', 'schema_applied_at'] as const;
export type SchemaMetaKey = (typeof SCHEMA_META_KEYS)[number];

/** Membership test used to build every guard below. */
export function isOneOf<T extends string>(
  values: readonly T[],
  candidate: unknown,
): candidate is T {
  return typeof candidate === 'string' && (values as readonly string[]).includes(candidate);
}

export const isCookStatus = (v: unknown): v is CookStatus => isOneOf(COOK_STATUSES, v);
export const isProvenance = (v: unknown): v is Provenance => isOneOf(PROVENANCES, v);
export const isCookEventKind = (v: unknown): v is CookEventKind =>
  isOneOf(COOK_EVENT_KINDS, v);
export const isFindingClass = (v: unknown): v is FindingClass => isOneOf(FINDING_CLASSES, v);
export const isConfidenceLevel = (v: unknown): v is ConfidenceLevel =>
  isOneOf(CONFIDENCE_LEVELS, v);
export const isProposalStatus = (v: unknown): v is ProposalStatus =>
  isOneOf(PROPOSAL_STATUSES, v);
export const isCreatedBy = (v: unknown): v is CreatedBy => isOneOf(CREATED_BY_VALUES, v);
export const isTagKind = (v: unknown): v is TagKind => isOneOf(TAG_KINDS, v);
export const isImportBatchStatus = (v: unknown): v is ImportBatchStatus =>
  isOneOf(IMPORT_BATCH_STATUSES, v);

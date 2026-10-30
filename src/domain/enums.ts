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
 * What a temperature reading was taken of.
 *
 * `oven` is the air in the oven, `internal` is the food itself, and `none` is
 * a reading that says neither — which includes every reading taken before this
 * vocabulary existed, and every reading taken somewhere else and described in
 * the cook's own words.
 *
 * Only `oven` and `internal` are ever written down. `none` is the *absence* of
 * `meta.readingKind`, not a value stored in it: a reading already in the
 * notebook must stay byte for byte what it was, and a reading taken somewhere
 * else is the same reading as one of those, so the two cannot be allowed to
 * differ in the file. `readingKindFromEvent` in `src/domain/invariants.ts` is
 * what turns an absence into `none`.
 */
export const READING_KINDS = ['oven', 'internal', 'none'] as const;
export type ReadingKind = (typeof READING_KINDS)[number];

/** The reading kinds that are written to `meta`. `none` is never one of them. */
export const STORED_READING_KINDS = ['oven', 'internal'] as const;
export type StoredReadingKind = (typeof STORED_READING_KINDS)[number];

/** The key a `temp` event carries its kind under, in `meta`, when it has one. */
export const READING_KIND_META_KEY = 'readingKind' as const;

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

/**
 * Tag namespaces, for a tag that has one.
 *
 * A tag does not have to have one, and from schema version 2 most do not: the
 * kitchen's own word for something is the tag, and asking which of four boxes
 * "brown butter" belongs in is a question the cook never asked. A kind is
 * therefore optional (`Tag.kind` is nullable), these four remain valid for
 * every tag that already carries one, and nothing new is given one.
 *
 * `(name, kind)` is unique for a tag with a kind, so "butter" the ingredient
 * and "butter" the technique stay two different tags; a tag with no kind is
 * unique by name alone, ignoring case.
 */
export const TAG_KINDS = ['dish', 'ingredient', 'technique', 'equipment'] as const;
export type TagKind = (typeof TAG_KINDS)[number];

/**
 * What an edit can change, from schema version 3 on.
 *
 * Two things, both the cook's own words: a `note` in the timeline and the
 * `verdict` on a reviewed cook. A reading and a photograph are not words and
 * are not edited; the title is a label the cook has always been able to change
 * in place, and stays that way.
 */
export const REVISED_FIELDS = ['note', 'verdict'] as const;
export type RevisedField = (typeof REVISED_FIELDS)[number];

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
/** A kind, or no kind at all. The second is the ordinary case from version 2 on. */
export const isTagKindOrNone = (v: unknown): v is TagKind | null =>
  v === null || isTagKind(v);
export const isReadingKind = (v: unknown): v is ReadingKind => isOneOf(READING_KINDS, v);
export const isStoredReadingKind = (v: unknown): v is StoredReadingKind =>
  isOneOf(STORED_READING_KINDS, v);
export const isRevisedField = (v: unknown): v is RevisedField => isOneOf(REVISED_FIELDS, v);
export const isImportBatchStatus = (v: unknown): v is ImportBatchStatus =>
  isOneOf(IMPORT_BATCH_STATUSES, v);

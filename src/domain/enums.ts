/**
 * Controlled vocabularies for the Cooking Lab local data model.
 *
 * Each vocabulary is declared once as a frozen tuple and the TypeScript union is
 * derived from it, so the compile-time type and the runtime guard can never
 * disagree. The SQL `CHECK` constraints in `src/data/schema/migrations.ts` are
 * written out literally rather than generated from these tuples — a migration's
 * text must stay frozen once it has run on a device — and
 * `__tests__/migrations.test.ts` asserts the two still agree. When they stop
 * agreeing that test fails, which is the signal that a new migration is needed.
 *
 * Nothing here refers to users, accounts, roles, policies or synchronisation.
 * Cooking Lab is a single-kitchen notebook held on one device; there is no
 * ownership concept to express, so there is no vocabulary for one.
 */

/** A cook's lifecycle. A cook exists from the moment it is planned. */
export const COOK_STATUSES = ['planned', 'in_progress', 'complete', 'abandoned'] as const;
export type CookStatus = (typeof COOK_STATUSES)[number];

/**
 * The cook's own judgement of how it went. This is raw evidence: it is recorded
 * by the person who ate the food and may never be written or revised by the
 * assistant. `unrated` is the honest default, not a missing value.
 */
export const COOK_VERDICTS = [
  'unrated',
  'failed',
  'poor',
  'acceptable',
  'good',
  'excellent',
] as const;
export type CookVerdict = (typeof COOK_VERDICTS)[number];

/**
 * Timeline entries captured during a cook. Also raw evidence — what actually
 * happened, in the order it happened.
 */
export const COOK_EVENT_KINDS = [
  'note',
  'observation',
  'temperature',
  'timing',
  'step',
  'adjustment',
  'taste',
  'photo',
] as const;
export type CookEventKind = (typeof COOK_EVENT_KINDS)[number];

/** Units permitted on a `temperature` event. */
export const TEMPERATURE_UNITS = ['c', 'f'] as const;
export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];

/**
 * Review lifecycle shared by findings and lessons.
 *
 * `rejected` is a state, not a deletion: the row is retained so the same
 * proposal is not silently raised again and so the record of what was rejected
 * survives.
 */
export const REVIEW_STATUSES = ['proposed', 'approved', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Who authored a record. There are exactly two possible authors. */
export const PROVENANCES = ['user', 'ai'] as const;
export type Provenance = (typeof PROVENANCES)[number];

/**
 * How much cooking actually stands behind a finding. Derived from the finding's
 * supporting sources rather than asserted, so a confident-sounding claim cannot
 * carry more weight than the cooks it came from.
 */
export const EVIDENCE_STRENGTHS = [
  'unsupported',
  'single',
  'corroborated',
  'strong',
] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];

/** Whether a cited source backs a finding up or argues against it. */
export const SOURCE_RELATIONS = ['supports', 'contradicts'] as const;
export type SourceRelation = (typeof SOURCE_RELATIONS)[number];

/** What a finding may cite. Only raw evidence may be cited. */
export const FINDING_SOURCE_KINDS = ['cook', 'cook_event'] as const;
export type FindingSourceKind = (typeof FINDING_SOURCE_KINDS)[number];

/** What a briefing may be built from. */
export const BRIEFING_SOURCE_KINDS = ['finding', 'lesson', 'cook'] as const;
export type BriefingSourceKind = (typeof BRIEFING_SOURCE_KINDS)[number];

/** Tag namespaces. `(name, kind)` is unique, so "butter" the ingredient and
 * "butter" the technique are two different tags. */
export const TAG_KINDS = [
  'ingredient',
  'technique',
  'equipment',
  'dish',
  'outcome',
  'free',
] as const;
export type TagKind = (typeof TAG_KINDS)[number];

/** Briefing lifecycle. A briefing is advice, never evidence. */
export const BRIEFING_STATUSES = ['draft', 'issued', 'dismissed'] as const;
export type BriefingStatus = (typeof BRIEFING_STATUSES)[number];

/** Import lifecycle. `failed` and `rejected` batches are retained. */
export const IMPORT_BATCH_STATUSES = ['pending', 'applied', 'rejected', 'failed'] as const;
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number];

/**
 * Where an import batch came from.
 *
 * There are deliberately only two, and only one of them is a production path.
 * `synthetic_fixture` exists so test data can never be mistaken for cooking that
 * actually happened; see `__tests__/fixtures/syntheticData.ts`.
 */
export const IMPORT_BATCH_ORIGINS = ['backup_restore', 'synthetic_fixture'] as const;
export type ImportBatchOrigin = (typeof IMPORT_BATCH_ORIGINS)[number];

/** The only import origin the shipping app may ever write. */
export const PRODUCTION_IMPORT_ORIGIN: ImportBatchOrigin = 'backup_restore';

/** Reserved `schema_meta` keys. */
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
export const isCookVerdict = (v: unknown): v is CookVerdict => isOneOf(COOK_VERDICTS, v);
export const isCookEventKind = (v: unknown): v is CookEventKind =>
  isOneOf(COOK_EVENT_KINDS, v);
export const isTemperatureUnit = (v: unknown): v is TemperatureUnit =>
  isOneOf(TEMPERATURE_UNITS, v);
export const isReviewStatus = (v: unknown): v is ReviewStatus => isOneOf(REVIEW_STATUSES, v);
export const isProvenance = (v: unknown): v is Provenance => isOneOf(PROVENANCES, v);
export const isEvidenceStrength = (v: unknown): v is EvidenceStrength =>
  isOneOf(EVIDENCE_STRENGTHS, v);
export const isSourceRelation = (v: unknown): v is SourceRelation =>
  isOneOf(SOURCE_RELATIONS, v);
export const isFindingSourceKind = (v: unknown): v is FindingSourceKind =>
  isOneOf(FINDING_SOURCE_KINDS, v);
export const isBriefingSourceKind = (v: unknown): v is BriefingSourceKind =>
  isOneOf(BRIEFING_SOURCE_KINDS, v);
export const isTagKind = (v: unknown): v is TagKind => isOneOf(TAG_KINDS, v);
export const isBriefingStatus = (v: unknown): v is BriefingStatus =>
  isOneOf(BRIEFING_STATUSES, v);
export const isImportBatchStatus = (v: unknown): v is ImportBatchStatus =>
  isOneOf(IMPORT_BATCH_STATUSES, v);
export const isImportBatchOrigin = (v: unknown): v is ImportBatchOrigin =>
  isOneOf(IMPORT_BATCH_ORIGINS, v);

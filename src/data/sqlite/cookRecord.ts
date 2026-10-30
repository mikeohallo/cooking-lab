/**
 * Update 2's storage (schema version 4): meal type, ingredients, the
 * household, ratings, next-time edits, the app's settings, and "Cook this
 * again".
 *
 * The same rules as `./repositories.ts` and `./services.ts`, in one module of
 * its own: repositories store and never decide; every value is bound; rows
 * that belong together are written in one transaction; and each service
 * method asks a pure rule (`src/domain/evidence.ts` rule 13, or
 * `src/domain/household.ts`) before it writes anything.
 */

import type {
  Cook,
  CookId,
  CookMealType,
  HouseholdMember,
  HouseholdMemberId,
  IngredientVersion,
  IsoTimestamp,
  Lesson,
  LessonId,
  LessonRevision,
  Rating,
  RatingId,
} from '../../domain/entities';
import type { MealType } from '../../domain/enums';
import type {
  Actor,
  EvidenceDecision,
  IngredientIdentity,
  LessonIdentity,
  RatingAnswer,
  RatingPerson,
} from '../../domain/evidence';
import {
  cookAgain as cookAgainRule,
  createUserLesson,
  rateCook,
  reviseLesson,
  saveIngredients as saveIngredientsRule,
  setMealType as setMealTypeRule,
} from '../../domain/evidence';
import { addMember, moveMember, restoreMember, retireMember } from '../../domain/household';
import type { DatabaseAdapter, SqlValue } from '../adapters';
import type {
  CookAgainPlan,
  CookRecordService,
  CookRepository,
  CookTagRepository,
  HouseholdRepository,
  HouseholdService,
  IngredientRepository,
  LessonRepository,
  LessonRevisionRepository,
  MealTypeRepository,
  RatingKey,
  RatingRepository,
  SettingsRepository,
} from '../repositories';
import { RecordNotFoundError } from './repositories';
import {
  COOK_COLUMNS,
  COOK_MEAL_TYPE_COLUMNS,
  HOUSEHOLD_MEMBER_COLUMNS,
  INGREDIENT_VERSION_COLUMNS,
  LESSON_REVISION_COLUMNS,
  RATING_COLUMNS,
  cookMealTypeParams,
  cookParams,
  householdMemberParams,
  ingredientVersionParams,
  lessonRevisionParams,
  placeholders,
  ratingParams,
  toCookMealType,
  toHouseholdMember,
  toIngredientVersion,
  toLessonRevision,
  toRating,
  writeBoolean,
} from './rows';

function insertInto(table: string, columns: string): string {
  return `INSERT INTO ${table} (${columns}) VALUES (${placeholders(columns.split(',').length)})`;
}

const KEPT_COOK = 'cook_id NOT IN (SELECT cook_id FROM cook_deletions)';

// ---------------------------------------------------------------------------
// Meal types
// ---------------------------------------------------------------------------

export function createMealTypeRepository(adapter: DatabaseAdapter): MealTypeRepository {
  return {
    async set(row: CookMealType): Promise<CookMealType> {
      await adapter.execute({
        sql: `${insertInto('cook_meal_types', COOK_MEAL_TYPE_COLUMNS)}
              ON CONFLICT(cook_id) DO UPDATE SET meal_type = excluded.meal_type, set_at = excluded.set_at`,
        params: cookMealTypeParams(row),
      });
      return row;
    },

    async clear(cookId: CookId): Promise<void> {
      await adapter.execute({ sql: 'DELETE FROM cook_meal_types WHERE cook_id = ?', params: [cookId] });
    },

    async findForCook(cookId: CookId): Promise<CookMealType | null> {
      const rows = await adapter.select({
        sql: `SELECT ${COOK_MEAL_TYPE_COLUMNS} FROM cook_meal_types WHERE cook_id = ?`,
        params: [cookId],
      });
      const first = rows[0];
      return first === undefined ? null : toCookMealType(first);
    },

    async listForCooks(cookIds: readonly CookId[]): Promise<readonly CookMealType[]> {
      if (cookIds.length === 0) {
        return [];
      }
      const rows = await adapter.select({
        sql: `SELECT ${COOK_MEAL_TYPE_COLUMNS} FROM cook_meal_types
              WHERE cook_id IN (${placeholders(cookIds.length)}) ORDER BY cook_id ASC`,
        params: [...cookIds],
      });
      return rows.map(toCookMealType);
    },
  };
}

// ---------------------------------------------------------------------------
// Ingredients
// ---------------------------------------------------------------------------

export function createIngredientRepository(adapter: DatabaseAdapter): IngredientRepository {
  return {
    async create(version: IngredientVersion): Promise<IngredientVersion> {
      await adapter.execute({
        sql: insertInto('ingredient_versions', INGREDIENT_VERSION_COLUMNS),
        params: ingredientVersionParams(version),
      });
      return version;
    },

    async listForCook(cookId: CookId): Promise<readonly IngredientVersion[]> {
      const rows = await adapter.select({
        sql: `SELECT ${INGREDIENT_VERSION_COLUMNS} FROM ingredient_versions
              WHERE cook_id = ? ORDER BY saved_at ASC, rowid ASC`,
        params: [cookId],
      });
      return rows.map(toIngredientVersion);
    },

    /**
     * The newest version per cook. Read oldest first and kept last-wins, so a
     * tie on time goes to the one written later, as everywhere else.
     */
    async currentForCooks(cookIds: readonly CookId[]): Promise<readonly IngredientVersion[]> {
      if (cookIds.length === 0) {
        return [];
      }
      const rows = await adapter.select({
        sql: `SELECT ${INGREDIENT_VERSION_COLUMNS} FROM ingredient_versions
              WHERE cook_id IN (${placeholders(cookIds.length)})
              ORDER BY saved_at ASC, rowid ASC`,
        params: [...cookIds],
      });
      const newest = new Map<CookId, IngredientVersion>();
      for (const row of rows) {
        const version = toIngredientVersion(row);
        newest.set(version.cookId, version);
      }
      return [...newest.values()];
    },
  };
}

// ---------------------------------------------------------------------------
// Household
// ---------------------------------------------------------------------------

export function createHouseholdRepository(adapter: DatabaseAdapter): HouseholdRepository {
  return {
    async list(): Promise<readonly HouseholdMember[]> {
      const rows = await adapter.select({
        sql: `SELECT ${HOUSEHOLD_MEMBER_COLUMNS} FROM household_members
              ORDER BY position ASC, created_at ASC, id ASC`,
        params: [],
      });
      return rows.map(toHouseholdMember);
    },

    async findById(id: HouseholdMemberId): Promise<HouseholdMember | null> {
      const rows = await adapter.select({
        sql: `SELECT ${HOUSEHOLD_MEMBER_COLUMNS} FROM household_members WHERE id = ?`,
        params: [id],
      });
      const first = rows[0];
      return first === undefined ? null : toHouseholdMember(first);
    },

    async create(member: HouseholdMember): Promise<HouseholdMember> {
      await adapter.execute({
        sql: insertInto('household_members', HOUSEHOLD_MEMBER_COLUMNS),
        params: householdMemberParams(member),
      });
      return member;
    },

    async save(member: HouseholdMember): Promise<HouseholdMember> {
      const result = await adapter.execute({
        sql: 'UPDATE household_members SET name = ?, position = ?, retired_at = ?, created_at = ? WHERE id = ?',
        params: [member.name, member.position, member.retiredAt, member.createdAt, member.id],
      });
      if (result.rowsAffected === 0) {
        throw new RecordNotFoundError('household member', member.id);
      }
      return member;
    },

    async reorder(ids: readonly HouseholdMemberId[]): Promise<void> {
      await adapter.withTransaction(async (tx) => {
        for (const [position, id] of ids.entries()) {
          await tx.execute({
            sql: 'UPDATE household_members SET position = ? WHERE id = ?',
            params: [position, id],
          });
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------

function ratingKeyClause(person: RatingKey, params: SqlValue[]): string {
  if ('memberId' in person) {
    params.push(person.memberId);
    return 'member_id = ?';
  }
  params.push(person.guestName.trim());
  return 'guest_name = ? COLLATE NOCASE';
}

export function createRatingRepository(adapter: DatabaseAdapter): RatingRepository {
  return {
    /**
     * One row per person per cook. A second answer replaces the first in
     * place and keeps its id, so a rating changed after dinner is still the
     * same rating.
     */
    async put(rating: Rating): Promise<Rating> {
      return adapter.withTransaction(async (tx) => {
        const params: SqlValue[] = [rating.cookId];
        const key: RatingKey =
          rating.memberId !== null ? { memberId: rating.memberId } : { guestName: rating.guestName ?? '' };
        const where = ratingKeyClause(key, params);
        const existing = await tx.select({
          sql: `SELECT id FROM ratings WHERE cook_id = ? AND ${where}`,
          params,
        });
        const existingId = existing[0]?.id;
        if (typeof existingId === 'string') {
          const kept: Rating = { ...rating, id: existingId };
          await tx.execute({
            sql: `UPDATE ratings SET guest_name = ?, stars = ?, not_eaten = ?, line = ?, rated_at = ?
                  WHERE id = ?`,
            params: [
              kept.guestName,
              kept.stars,
              writeBoolean(kept.notEaten),
              kept.line,
              kept.ratedAt,
              kept.id,
            ],
          });
          return kept;
        }
        await tx.execute({ sql: insertInto('ratings', RATING_COLUMNS), params: ratingParams(rating) });
        return rating;
      });
    },

    async remove(cookId: CookId, person: RatingKey): Promise<void> {
      const params: SqlValue[] = [cookId];
      const where = ratingKeyClause(person, params);
      await adapter.execute({ sql: `DELETE FROM ratings WHERE cook_id = ? AND ${where}`, params });
    },

    async listForCook(cookId: CookId): Promise<readonly Rating[]> {
      const rows = await adapter.select({
        sql: `SELECT ${RATING_COLUMNS} FROM ratings WHERE cook_id = ? ORDER BY rated_at ASC, rowid ASC`,
        params: [cookId],
      });
      return rows.map(toRating);
    },

    async listForCooks(cookIds: readonly CookId[]): Promise<readonly Rating[]> {
      if (cookIds.length === 0) {
        return [];
      }
      const rows = await adapter.select({
        sql: `SELECT ${RATING_COLUMNS} FROM ratings
              WHERE cook_id IN (${placeholders(cookIds.length)})
              ORDER BY cook_id ASC, rated_at ASC, rowid ASC`,
        params: [...cookIds],
      });
      return rows.map(toRating);
    },

    async listGuestNames(): Promise<readonly string[]> {
      const rows = await adapter.select({
        sql: `SELECT guest_name FROM ratings
              WHERE guest_name IS NOT NULL AND ${KEPT_COOK}
              ORDER BY guest_name COLLATE NOCASE ASC, rated_at ASC`,
        params: [],
      });
      const seen = new Set<string>();
      const names: string[] = [];
      for (const row of rows) {
        const name = String(row.guest_name);
        if (!seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          names.push(name);
        }
      }
      return names;
    },
  };
}

// ---------------------------------------------------------------------------
// Next-time edits
// ---------------------------------------------------------------------------

export function createLessonRevisionRepository(adapter: DatabaseAdapter): LessonRevisionRepository {
  return {
    async create(revision: LessonRevision): Promise<LessonRevision> {
      await adapter.execute({
        sql: insertInto('lesson_revisions', LESSON_REVISION_COLUMNS),
        params: lessonRevisionParams(revision),
      });
      return revision;
    },

    async listForCook(cookId: CookId): Promise<readonly LessonRevision[]> {
      const rows = await adapter.select({
        sql: `SELECT ${LESSON_REVISION_COLUMNS} FROM lesson_revisions
              WHERE cook_id = ? ORDER BY revised_at ASC, rowid ASC`,
        params: [cookId],
      });
      return rows.map(toLessonRevision);
    },

    async listForCooks(cookIds: readonly CookId[]): Promise<readonly LessonRevision[]> {
      if (cookIds.length === 0) {
        return [];
      }
      const rows = await adapter.select({
        sql: `SELECT ${LESSON_REVISION_COLUMNS} FROM lesson_revisions
              WHERE cook_id IN (${placeholders(cookIds.length)})
              ORDER BY revised_at ASC, rowid ASC`,
        params: [...cookIds],
      });
      return rows.map(toLessonRevision);
    },
  };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function createSettingsRepository(adapter: DatabaseAdapter): SettingsRepository {
  return {
    async get(key: string): Promise<string | null> {
      const rows = await adapter.select({ sql: 'SELECT value FROM app_settings WHERE key = ?', params: [key] });
      const value = rows[0]?.value;
      return typeof value === 'string' ? value : null;
    },

    async set(key: string, value: string): Promise<void> {
      await adapter.execute({
        sql: `INSERT INTO app_settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        params: [key, value],
      });
    },
  };
}

/** Whether the review has asked "Who usually eats?" before. */
export const HOUSEHOLD_ASKED_KEY = 'household_asked';

// ---------------------------------------------------------------------------
// Cook this again: one transaction
// ---------------------------------------------------------------------------

export function createCookAgainWriter(adapter: DatabaseAdapter): {
  write(plan: CookAgainPlan): Promise<void>;
} {
  return {
    async write(plan: CookAgainPlan): Promise<void> {
      await adapter.withTransaction(async (tx) => {
        await tx.execute({ sql: insertInto('cooks', COOK_COLUMNS), params: cookParams(plan.cook) });
        for (const tagId of plan.tagIds) {
          await tx.execute({
            sql: 'INSERT OR IGNORE INTO cook_tags (cook_id, tag_id) VALUES (?, ?)',
            params: [plan.cook.id, tagId],
          });
        }
        if (plan.mealType !== null) {
          await tx.execute({
            sql: insertInto('cook_meal_types', COOK_MEAL_TYPE_COLUMNS),
            params: cookMealTypeParams(plan.mealType),
          });
        }
        if (plan.ingredients !== null) {
          await tx.execute({
            sql: insertInto('ingredient_versions', INGREDIENT_VERSION_COLUMNS),
            params: ingredientVersionParams(plan.ingredients),
          });
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

async function loadOrThrow<T>(load: () => Promise<T | null>, what: string, id: string): Promise<T> {
  const record = await load();
  if (record === null) {
    throw new RecordNotFoundError(what, id);
  }
  return record;
}

export type CookRecordDependencies = {
  readonly cooks: CookRepository;
  readonly cookTags: CookTagRepository;
  readonly lessons: LessonRepository;
  readonly mealTypes: MealTypeRepository;
  readonly ingredients: IngredientRepository;
  readonly ratings: RatingRepository;
  readonly lessonRevisions: LessonRevisionRepository;
  readonly cookAgainWriter: { write(plan: CookAgainPlan): Promise<void> };
};

export function createCookRecordService(deps: CookRecordDependencies): CookRecordService {
  const currentIngredients = async (cookId: CookId): Promise<IngredientVersion | null> => {
    const versions = await deps.ingredients.listForCook(cookId);
    return versions[versions.length - 1] ?? null;
  };

  return {
    async setMealType(
      cookId: CookId,
      mealType: MealType,
      actor: Actor,
      at: IsoTimestamp,
    ): Promise<EvidenceDecision<CookMealType | null>> {
      const cook = await loadOrThrow(() => deps.cooks.findById(cookId), 'cook', cookId);
      const decision = setMealTypeRule(cook, mealType, actor, at);
      if (!decision.allowed) {
        return decision;
      }
      if (decision.record === null) {
        await deps.mealTypes.clear(cookId);
        return decision;
      }
      return { allowed: true, record: await deps.mealTypes.set(decision.record) };
    },

    async saveIngredients(
      cookId: CookId,
      text: string,
      identity: IngredientIdentity,
      actor: Actor,
      at: IsoTimestamp,
    ): Promise<EvidenceDecision<IngredientVersion>> {
      const cook = await loadOrThrow(() => deps.cooks.findById(cookId), 'cook', cookId);
      const current = await currentIngredients(cookId);
      const decision = saveIngredientsRule(cook, text, current?.text ?? null, identity, actor, at);
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await deps.ingredients.create(decision.record) };
    },

    async rate(
      cookId: CookId,
      person: RatingPerson,
      answer: RatingAnswer,
      identity: { readonly id: RatingId },
      actor: Actor,
      at: IsoTimestamp,
    ): Promise<EvidenceDecision<Rating | null>> {
      const cook = await loadOrThrow(() => deps.cooks.findById(cookId), 'cook', cookId);
      const decision = rateCook(cook, person, answer, identity, actor, at);
      if (!decision.allowed) {
        return decision;
      }
      if (decision.record === null) {
        await deps.ratings.remove(
          cookId,
          person.memberId !== undefined ? { memberId: person.memberId } : { guestName: person.guestName },
        );
        return decision;
      }
      return { allowed: true, record: await deps.ratings.put(decision.record) };
    },

    async addNextTime(
      cookId: CookId,
      text: string,
      identity: LessonIdentity,
      actor: Actor,
      at: IsoTimestamp,
    ): Promise<EvidenceDecision<Lesson>> {
      await loadOrThrow(() => deps.cooks.findById(cookId), 'cook', cookId);
      const trimmed = text.trim();
      if (trimmed === '') {
        return {
          allowed: false,
          code: 'revision_needs_words',
          message: 'write something first; a next-time line needs words',
        };
      }
      const decision = createUserLesson({ cookId, text: trimmed }, identity, actor, at);
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await deps.lessons.create(decision.record) };
    },

    async reviseNextTime(
      lessonId: LessonId,
      text: string,
      identity: { readonly id: string },
      actor: Actor,
      at: IsoTimestamp,
    ): Promise<EvidenceDecision<LessonRevision>> {
      const lesson = await loadOrThrow(() => deps.lessons.findById(lessonId), 'lesson', lessonId);
      const decision = reviseLesson(lesson, text, identity, actor, at);
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await deps.lessonRevisions.create(decision.record) };
    },

    /**
     * Read the earlier cook, let the rule build the new one, then write the
     * cook, its tags, its meal type and its first ingredients together. The
     * earlier cook is only read.
     */
    async cookAgain(
      sourceId: CookId,
      identity: { readonly id: CookId; readonly ingredientsId: string },
      actor: Actor,
      at: IsoTimestamp,
    ): Promise<EvidenceDecision<Cook>> {
      const source = await loadOrThrow(() => deps.cooks.findById(sourceId), 'cook', sourceId);
      const decision = cookAgainRule(source, { id: identity.id }, actor, at);
      if (!decision.allowed) {
        return decision;
      }
      const cook = decision.record;
      const [tags, mealType, ingredients] = await Promise.all([
        deps.cookTags.listForCook(sourceId),
        deps.mealTypes.findForCook(sourceId),
        currentIngredients(sourceId),
      ]);
      await deps.cookAgainWriter.write({
        cook,
        tagIds: tags.map((tag) => tag.id),
        mealType: mealType === null ? null : { cookId: cook.id, mealType: mealType.mealType, setAt: at },
        ingredients:
          ingredients === null
            ? null
            : { id: identity.ingredientsId, cookId: cook.id, text: ingredients.text, savedAt: at },
      });
      return { allowed: true, record: cook };
    },
  };
}

export function createHouseholdService(household: HouseholdRepository): HouseholdService {
  return {
    async add(name, identity, at) {
      const decision = addMember(name, await household.list(), identity, at);
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await household.create(decision.record) };
    },

    async retire(id, at) {
      const member = await loadOrThrow(() => household.findById(id), 'household member', id);
      const decision = retireMember(member, at);
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await household.save(decision.record) };
    },

    async restore(id) {
      const member = await loadOrThrow(() => household.findById(id), 'household member', id);
      const decision = restoreMember(member, await household.list());
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await household.save(decision.record) };
    },

    async move(id, direction) {
      const order = moveMember(await household.list(), id, direction);
      await household.reorder(order);
      return household.list();
    },
  };
}

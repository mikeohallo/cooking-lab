/**
 * The photograph on a cook's card (0.4.0, part 1).
 *
 * A card shows, in this order of preference:
 *
 *   1. the cook's own first photo;
 *   2. otherwise the first photo of the cook it was cooked again from — and if
 *      that one has none, its own parent's, and so on along the Cook this
 *      again chain (`parent_cook_id`), nearest first;
 *   3. otherwise nothing, and the card draws its meal tile.
 *
 * "First" is the timeline's order, the one every screen already uses
 * (`CookEventRepository.listForCook`): by `ts`, then by the order the entries
 * were written. A photograph's `ts` is where it sits in the timeline — the
 * moment it was taken when that moment could be read and believed, otherwise
 * the moment it was added (`src/domain/photoTime.ts`) — so the first photo is
 * the earliest one in the cook as the cook reads it.
 *
 * The chain is followed as it now stands. A cook deleted for good has already
 * cut it (the schema sets its children's `parent_cook_id` to NULL), and a cook
 * whose deletion is pending ends it too: to the cook it is already gone, and
 * once the undo window closes the link will be cut anyway. Undo brings both
 * the cook and its photo back.
 *
 * Read only, and in three statements however many cards are asked for: the
 * chains of all of them in one recursive query, the cooks whose deletion is
 * pending, and the first photo of every cook involved.
 */

import type { CookEvent, CookId } from '../../domain/entities';
import type { DatabaseAdapter } from '../adapters';
import type { CardPhoto, CardPhotoService } from '../repositories';
import { COOK_EVENT_COLUMNS, placeholders, toCookEvent } from './rows';

/** How far back a chain is followed: a guard against a loop, never a real limit. */
export const MAX_CARD_PHOTO_CHAIN = 500;

/** The same columns, qualified, for the query below. */
const EVENT_COLUMNS_E = COOK_EVENT_COLUMNS.split(',')
  .map((column) => `e.${column.trim()}`)
  .join(', ');

export function createCardPhotoService(adapter: DatabaseAdapter): CardPhotoService {
  /** Each cook's first photo, by cook, for the cooks that have one. */
  const firstPhotos = async (cookIds: readonly CookId[]): Promise<Map<CookId, CookEvent>> => {
    const first = new Map<CookId, CookEvent>();
    if (cookIds.length === 0) {
      return first;
    }
    const rows = await adapter.select({
      sql: `SELECT ${EVENT_COLUMNS_E} FROM cook_events e
            WHERE e.kind = 'photo' AND e.photo_path IS NOT NULL
              AND e.cook_id IN (${placeholders(cookIds.length)})
              AND NOT EXISTS (
                SELECT 1 FROM cook_events f
                WHERE f.cook_id = e.cook_id AND f.kind = 'photo' AND f.photo_path IS NOT NULL
                  AND (f.ts < e.ts OR (f.ts = e.ts AND f.rowid < e.rowid))
              )`,
      params: [...cookIds],
    });
    for (const row of rows) {
      const event = toCookEvent(row);
      if (!first.has(event.cookId)) {
        first.set(event.cookId, event);
      }
    }
    return first;
  };

  return {
    async forCooks(cookIds: readonly CookId[]): Promise<ReadonlyMap<CookId, CardPhoto>> {
      const cards = [...new Set(cookIds)];
      const result = new Map<CookId, CardPhoto>();
      if (cards.length === 0) {
        return result;
      }

      // Every card's chain of earlier cooks, nearest first, in one statement.
      const chainRows = await adapter.select({
        sql: `WITH RECURSIVE chain(card_id, ancestor_id, depth) AS (
                SELECT id, parent_cook_id, 1 FROM cooks
                WHERE id IN (${placeholders(cards.length)}) AND parent_cook_id IS NOT NULL
                UNION ALL
                SELECT chain.card_id, c.parent_cook_id, chain.depth + 1
                FROM chain JOIN cooks c ON c.id = chain.ancestor_id
                WHERE c.parent_cook_id IS NOT NULL AND chain.depth < ?
              )
              SELECT card_id, ancestor_id, depth FROM chain ORDER BY card_id ASC, depth ASC`,
        params: [...cards, MAX_CARD_PHOTO_CHAIN],
      });
      const pendingRows = await adapter.select({ sql: 'SELECT cook_id FROM cook_deletions' });
      const pending = new Set(pendingRows.map((row) => String(row.cook_id)));

      // The chain each card may borrow from: up to the first cook that is
      // gone to the cook (pending deletion) or that the chain has seen before.
      const chains = new Map<CookId, CookId[]>();
      const ended = new Set<CookId>();
      for (const row of chainRows) {
        const card = String(row.card_id);
        const ancestor = String(row.ancestor_id);
        if (ended.has(card)) {
          continue;
        }
        let chain = chains.get(card);
        if (chain === undefined) {
          chain = [];
          chains.set(card, chain);
        }
        if (pending.has(ancestor) || ancestor === card || chain.includes(ancestor)) {
          ended.add(card);
          continue;
        }
        chain.push(ancestor);
      }

      const involved = new Set<CookId>(cards);
      for (const chain of chains.values()) {
        for (const id of chain) {
          involved.add(id);
        }
      }
      const photos = await firstPhotos([...involved]);

      for (const card of cards) {
        const own = photos.get(card);
        if (own !== undefined) {
          result.set(card, { cookId: card, event: own, fromCookId: card, inherited: false });
          continue;
        }
        for (const ancestor of chains.get(card) ?? []) {
          const borrowed = photos.get(ancestor);
          if (borrowed !== undefined) {
            result.set(card, { cookId: card, event: borrowed, fromCookId: ancestor, inherited: true });
            break;
          }
        }
      }
      return result;
    },
  };
}

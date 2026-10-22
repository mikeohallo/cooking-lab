/**
 * A cook's tags, and the lists the tag controls are built from.
 *
 * Three reads and two writes, held together so every screen that tags a cook —
 * the cook's own page, open or reviewed, and Review — behaves identically. All
 * three reads are refreshed after every write, because adding a tag changes two
 * of the lists: the tag may be new, and it is now used one more time.
 *
 * WHY NOT `useWrite`
 * ------------------
 * `useWrite` wraps an `EvidenceDecision`, and a tag is not evidence. It is not
 * something observed and it is not a claim about a cook; it is the kitchen's own
 * filing. There is nothing for the evidence rules to permit or refuse, so there
 * is no decision to carry, and pretending otherwise would put a rule in front of
 * a write that no rule governs. Failures are still values and still reach the
 * screen, which is the part that matters.
 *
 * REMOVING A TAG FROM A COOK LEAVES IT ON EVERY OTHER COOK
 * -------------------------------------------------------
 * `unlink` and nothing else. The tag row itself is never deleted here: "not on
 * this cook" and "not a word I use" are different, and only the cook can mean
 * the second. A tag that ends up on no cook simply stops appearing in the
 * lists, which are built from `listUsedTags`.
 */

import { useCallback, useEffect, useState } from 'react';

import type { CookId, Tag, TagId } from '../domain/entities';
import { parseTagName } from '../domain/invariants';
import { useStorage } from './StorageProvider';

/** How many previously used tags the one-tap line offers. */
export const USED_BEFORE_LIMIT = 6;
/** How many suggestions the field offers while a word is being typed. */
export const SUGGESTION_LIMIT = 6;

export type CookTagsState = {
  /** The tags on this cook, alphabetically. */
  readonly tags: readonly Tag[];
  /** Every tag that is on at least one cook, alphabetically. */
  readonly allTags: readonly Tag[];
  /** The most-used tags that are not already on this cook. */
  readonly usedBefore: readonly Tag[];
  readonly loading: boolean;
  /** Why the last add or remove did not happen. Cleared by the next attempt. */
  readonly problem: string | null;
  readonly saving: boolean;
};

export type CookTagsControls = {
  /** Adds a typed name, creating the tag if the kitchen has not used it before. */
  add(raw: string): Promise<boolean>;
  /** Adds a tag that already exists, from one of the lists. */
  addExisting(tag: Tag): Promise<boolean>;
  remove(tagId: TagId): Promise<boolean>;
  /** Adds the tag if it is on this cook, removes it if it is not. */
  toggle(tag: Tag): Promise<boolean>;
  /** Tags matching what has been typed so far, for the field's suggestions. */
  suggest(fragment: string): Promise<readonly Tag[]>;
};

export function useCookTags(
  cookId: CookId,
  refreshToken = 0,
): CookTagsState & CookTagsControls {
  const { data } = useStorage();
  const [tags, setTags] = useState<readonly Tag[]>([]);
  const [allTags, setAllTags] = useState<readonly Tag[]>([]);
  const [mostUsed, setMostUsed] = useState<readonly Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** The three lists, read together. Reads only; it sets no state itself. */
  const read = useCallback(async () => {
    const [onCook, used, popular] = await Promise.all([
      data.cookTags.listForCook(cookId),
      data.cookTags.listUsedTags(),
      data.cookTags.listMostUsedTags(USED_BEFORE_LIMIT * 2),
    ]);
    return { onCook, used, popular };
  }, [data, cookId]);

  const apply = useCallback((loaded: Awaited<ReturnType<typeof read>>) => {
    setTags(loaded.onCook);
    setAllTags(loaded.used);
    setMostUsed(loaded.popular);
    setLoading(false);
  }, []);

  // State is set in the callbacks rather than in the effect body, as every
  // other hook here does: a `setState` run synchronously while an effect is
  // still going is what makes a render cascade.
  useEffect(() => {
    let live = true;
    read().then(
      (loaded) => {
        if (live) {
          apply(loaded);
        }
      },
      (cause: unknown) => {
        if (live) {
          setProblem(cause instanceof Error ? cause.message : String(cause));
          setLoading(false);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [read, apply, refreshToken]);

  /** Runs a write, reloads the lists, and turns a failure into a message. */
  const write = useCallback(
    async (work: () => Promise<void>): Promise<boolean> => {
      setProblem(null);
      setSaving(true);
      try {
        await work();
        apply(await read());
        return true;
      } catch (cause: unknown) {
        setProblem(cause instanceof Error ? cause.message : String(cause));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [read, apply],
  );

  const addExisting = useCallback(
    async (tag: Tag): Promise<boolean> =>
      write(async () => {
        await data.cookTags.link({ cookId, tagId: tag.id });
      }),
    [write, data, cookId],
  );

  const add = useCallback(
    async (raw: string): Promise<boolean> => {
      const parsed = parseTagName(raw);
      if (!parsed.ok) {
        setProblem(parsed.message);
        return false;
      }
      return write(async () => {
        // No kind: a tag is the kitchen's own word for something, and which of
        // four boxes it belongs in is a question nobody asked.
        const tag = await data.tags.findOrCreate(parsed.name, null);
        await data.cookTags.link({ cookId, tagId: tag.id });
      });
    },
    [write, data, cookId],
  );

  const remove = useCallback(
    async (tagId: TagId): Promise<boolean> =>
      write(async () => {
        await data.cookTags.unlink(cookId, tagId);
      }),
    [write, data, cookId],
  );

  const toggle = useCallback(
    async (tag: Tag): Promise<boolean> =>
      tags.some((existing) => existing.id === tag.id) ? remove(tag.id) : addExisting(tag),
    [tags, remove, addExisting],
  );

  const suggest = useCallback(
    async (fragment: string): Promise<readonly Tag[]> => {
      const needle = fragment.trim();
      if (needle === '') {
        return [];
      }
      try {
        const matches = await data.tags.suggest(needle, SUGGESTION_LIMIT * 3);
        const used = new Set(allTags.map((tag) => tag.id));
        const already = new Set(tags.map((tag) => tag.id));
        // Only tags the kitchen actually uses, and not one already on this cook:
        // offering back a tag that is already a chip above the field is noise.
        return matches
          .filter((tag) => used.has(tag.id) && !already.has(tag.id))
          .slice(0, SUGGESTION_LIMIT);
      } catch {
        // Suggestions are a convenience; failing to fetch them must never stop
        // the cook typing the tag out in full.
        return [];
      }
    },
    [data, allTags, tags],
  );

  const onCook = new Set(tags.map((tag) => tag.id));
  const usedBefore = mostUsed.filter((tag) => !onCook.has(tag.id)).slice(0, USED_BEFORE_LIMIT);

  return {
    tags,
    allTags,
    usedBefore,
    loading,
    problem,
    saving,
    add,
    addExisting,
    remove,
    toggle,
    suggest,
  };
}

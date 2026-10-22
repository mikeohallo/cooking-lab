/**
 * Searching a kitchen's history, as a pure function over records.
 *
 * No storage, no screen and no SQL. History loads its cooks and their tags the
 * way it already did and hands them here; everything about what matches, how
 * results are grouped, in what order they come out and which letters are
 * highlighted is decided in this file, where it can be read and tested without
 * a database or a render.
 *
 * WHY THE MATCHING IS IN JAVASCRIPT AND NOT IN SQL
 * -----------------------------------------------
 * A `LIKE` across two tables can say whether a cook matches. It cannot say
 * *how many* of the typed words matched, which is the whole of the ranking, nor
 * where in the title the match was, which is the whole of the highlighting. A
 * notebook holds one kitchen's cooks — hundreds, not millions — so matching
 * them in memory is the cheaper engineering and the better answer.
 *
 * THE TWO GROUPS
 * --------------
 * A search for "pork cider" should not hide the pork chops just because they
 * were not cooked in cider. So everything that matched *every* term comes
 * first, under **All**, and everything that matched at least one comes after it
 * under **Some**, best first. Nothing is silently dropped, and nothing that
 * only half matched is mixed in with what matched completely.
 */

import type { Cook, CookId, Tag } from '../../domain/entities';

/**
 * One term of a search.
 *
 * `typed` terms come from the search box, one per word: words are how a person
 * types a search, and "pork chops" typed in the box means both words, either of
 * which may be the one that finds it.
 *
 * `tag` terms come from tapping a tag, and are matched whole. That is the
 * difference that matters: a tag called "brown butter" is one thing the kitchen
 * named, so tapping it searches for that thing and not for everything brown.
 */
export type SearchTerm = {
  readonly text: string;
  readonly source: 'typed' | 'tag';
};

export type SearchInput = {
  /** What is in the search box, as typed. */
  readonly typed: string;
  /** The names of the tags that have been tapped, each one whole term. */
  readonly pickedTags: readonly string[];
};

/** A run of text, and whether it matched. Used to draw a highlighted line. */
export type HighlightedSegment = {
  readonly text: string;
  readonly matched: boolean;
};

export type SearchHit = {
  readonly cook: Cook;
  readonly tags: readonly Tag[];
  /** How many distinct terms this cook matched. */
  readonly matched: number;
  /** The title, split for highlighting. */
  readonly title: readonly HighlightedSegment[];
  /** The tag line, split for highlighting, in tag order. */
  readonly tagLine: readonly HighlightedSegment[];
};

export type SearchResults = {
  /** The terms the search actually ran with, after normalising. */
  readonly terms: readonly SearchTerm[];
  /** Cooks that matched every term. */
  readonly all: readonly SearchHit[];
  /** Cooks that matched at least one term but not all of them. */
  readonly some: readonly SearchHit[];
};

/** A cook and its tags, which is everything a search looks at. */
export type SearchableCook = {
  readonly cook: Cook;
  readonly tags: readonly Tag[];
};

function normalise(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The terms a search will run with.
 *
 * Typed text becomes one term per word; a tapped tag becomes one term however
 * many words it has. Duplicates are dropped — typing "pork" and also tapping
 * the tag "pork" is one term, not two, or the same cook would score twice for
 * one word. A tapped tag wins the duplicate, because it is the more specific
 * thing the person asked for.
 */
export function searchTerms(input: SearchInput): readonly SearchTerm[] {
  const terms: SearchTerm[] = [];
  const seen = new Set<string>();

  for (const name of input.pickedTags) {
    const text = normalise(name);
    if (text !== '' && !seen.has(text)) {
      seen.add(text);
      terms.push({ text, source: 'tag' });
    }
  }
  for (const word of normalise(input.typed).split(' ')) {
    if (word !== '' && !seen.has(word)) {
      seen.add(word);
      terms.push({ text: word, source: 'typed' });
    }
  }

  return terms;
}

/** Whether this character ends a word, so a match can be held to starting one. */
function isWordBoundary(character: string | undefined): boolean {
  return character === undefined || !/[a-z0-9]/i.test(character);
}

/**
 * Where `term` appears in `text`, at the start of a word.
 *
 * Word-start rather than anywhere: typing "ham" should find the ham, not the
 * Nottingham, and a search that matches the middle of words turns three letters
 * into a list of everything. Typing "cho" still finds "chops" while the word is
 * half typed, which is the behaviour a person actually wants from a search box.
 *
 * A multi-word term is matched as a phrase, which is what makes a tapped
 * "brown butter" one thing: the space in it has to be there in the text too.
 */
export function wordStartMatches(text: string, term: string): readonly number[] {
  const haystack = text.toLowerCase();
  const found: number[] = [];
  let from = 0;

  while (from <= haystack.length - term.length) {
    const at = haystack.indexOf(term, from);
    if (at === -1) {
      break;
    }
    if (isWordBoundary(haystack[at - 1])) {
      found.push(at);
    }
    from = at + 1;
  }

  return found;
}

/**
 * Split text into matched and unmatched runs.
 *
 * Overlapping matches are merged rather than nested, so "brown" and "brown
 * butter" together highlight one run and not a run inside a run.
 */
export function highlight(
  text: string,
  terms: readonly SearchTerm[],
): readonly HighlightedSegment[] {
  if (text === '') {
    return [];
  }
  const ranges: { start: number; end: number }[] = [];
  for (const term of terms) {
    for (const at of wordStartMatches(text, term.text)) {
      ranges.push({ start: at, end: at + term.text.length });
    }
  }
  if (ranges.length === 0) {
    return [{ text, matched: false }];
  }

  ranges.sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last !== undefined && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      continue;
    }
    merged.push({ ...range });
  }

  const segments: HighlightedSegment[] = [];
  let at = 0;
  for (const range of merged) {
    if (range.start > at) {
      segments.push({ text: text.slice(at, range.start), matched: false });
    }
    segments.push({ text: text.slice(range.start, range.end), matched: true });
    at = range.end;
  }
  if (at < text.length) {
    segments.push({ text: text.slice(at), matched: false });
  }
  return segments;
}

/** How a cook's tags are shown and highlighted as one line. */
export const TAG_LINE_SEPARATOR = ' · ';

function tagLineOf(tags: readonly Tag[]): string {
  return tags.map((tag) => tag.name).join(TAG_LINE_SEPARATOR);
}

/** The title a search matches against. An unnamed cook has nothing to match. */
function titleOf(cook: Cook): string {
  return cook.title ?? '';
}

/**
 * Which terms a cook matched.
 *
 * A term counts once however many times it appears: a title that says "pork"
 * twice is not twice the match, and counting occurrences would rank a long
 * rambling title above the cook that was actually about it.
 */
function matchedTerms(
  entry: SearchableCook,
  terms: readonly SearchTerm[],
): readonly SearchTerm[] {
  const title = titleOf(entry.cook);
  return terms.filter(
    (term) =>
      wordStartMatches(title, term.text).length > 0 ||
      entry.tags.some((tag) => wordStartMatches(tag.name, term.text).length > 0),
  );
}

/**
 * Run a search.
 *
 * With no terms, both groups come back empty and the caller shows its ordinary
 * list: an empty search box is not a search that found nothing, and a screen
 * that said "nothing matched" before a word had been typed would be lying.
 *
 * Order within a group is most matches first, then newest first. Newest second
 * rather than first because the question a search answers is "which cook", and
 * among cooks that answered it equally well the recent one is the likelier.
 */
export function searchCooks(
  entries: readonly SearchableCook[],
  input: SearchInput,
): SearchResults {
  const terms = searchTerms(input);
  if (terms.length === 0) {
    return { terms, all: [], some: [] };
  }

  const hits: SearchHit[] = [];
  for (const entry of entries) {
    const matched = matchedTerms(entry, terms);
    if (matched.length === 0) {
      continue;
    }
    hits.push({
      cook: entry.cook,
      tags: entry.tags,
      matched: matched.length,
      title: highlight(titleOf(entry.cook), terms),
      tagLine: highlight(tagLineOf(entry.tags), terms),
    });
  }

  const byRank = (left: SearchHit, right: SearchHit): number =>
    right.matched - left.matched ||
    Date.parse(right.cook.startedAt) - Date.parse(left.cook.startedAt);

  return {
    terms,
    all: hits.filter((hit) => hit.matched === terms.length).sort(byRank),
    some: hits.filter((hit) => hit.matched < terms.length).sort(byRank),
  };
}

/** Index the tags of several cooks by cook, for `searchCooks`. */
export function searchable(
  cooks: readonly Cook[],
  tagsByCook: ReadonlyMap<CookId, readonly Tag[]>,
): readonly SearchableCook[] {
  return cooks.map((cook) => ({ cook, tags: tagsByCook.get(cook.id) ?? [] }));
}

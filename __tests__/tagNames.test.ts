/**
 * What a tag name is.
 *
 * One rule, in one place (`parseTagName`), because the field, the suggestions,
 * the lists and the writes all have to agree about what "Brown  Butter" is —
 * and if they disagree, the kitchen ends up with two tags that look identical
 * on screen.
 */

import {
  MAX_TAG_ENTRY_LENGTH,
  MAX_TAG_NAME_LENGTH,
  normaliseTagName,
  parseTagName,
  validateTag,
} from '../src/domain/invariants';
import { TAG_KINDS } from '../src/domain/enums';

function nameOf(raw: string): string {
  const parsed = parseTagName(raw);
  if (!parsed.ok) {
    throw new Error(`expected "${raw}" to be a tag name, but: ${parsed.message}`);
  }
  return parsed.name;
}

describe('normalising a tag name', () => {
  it('trims, collapses inner spaces and lower-cases', () => {
    expect(normaliseTagName('  Brown   Butter  ')).toBe('brown butter');
    expect(nameOf('  Brown   Butter  ')).toBe('brown butter');
  });

  it('keeps several words as several words', () => {
    // The point of allowing them: "brown butter" is two words in the kitchen.
    expect(nameOf('brown butter')).toBe('brown butter');
    expect(nameOf('slow roast shoulder')).toBe('slow roast shoulder');
  });

  it('makes two spellings of the same thing one name', () => {
    const spellings = ['brown butter', 'Brown Butter', 'BROWN BUTTER', ' brown  butter '];

    expect(new Set(spellings.map(nameOf)).size).toBe(1);
  });

  it('treats tabs and newlines as the spaces they are', () => {
    expect(nameOf('brown\tbutter')).toBe('brown butter');
    expect(nameOf('brown\n butter')).toBe('brown butter');
  });
});

describe('what the cook may type', () => {
  it('refuses nothing at all, with something to read', () => {
    for (const raw of ['', '   ', '\t', '\n']) {
      const parsed = parseTagName(raw);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.message).toMatch(/word/i);
      }
    }
  });

  it('allows a name of exactly forty characters', () => {
    const forty = 'a'.repeat(MAX_TAG_ENTRY_LENGTH);

    expect(MAX_TAG_ENTRY_LENGTH).toBe(40);
    expect(nameOf(forty)).toBe(forty);
  });

  it('refuses one character more, and says the limit', () => {
    const parsed = parseTagName('a'.repeat(MAX_TAG_ENTRY_LENGTH + 1));

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.message).toContain(String(MAX_TAG_ENTRY_LENGTH));
    }
  });

  it('measures the length after trimming, not before', () => {
    // Trailing spaces do not make a name longer, so a name that fits should not
    // be refused for being typed with a space after it.
    const padded = `  ${'a'.repeat(MAX_TAG_ENTRY_LENGTH)}  `;

    expect(nameOf(padded)).toHaveLength(MAX_TAG_ENTRY_LENGTH);
  });
});

describe('what the store will hold', () => {
  it('accepts a name longer than the entry limit, up to its own', () => {
    // The two limits are different on purpose: this one is what the store will
    // hold, including a name written by an earlier build or restored from a
    // backup. Lowering it to match the field would make existing data invalid,
    // which is not validation, it is data loss.
    expect(MAX_TAG_NAME_LENGTH).toBeGreaterThan(MAX_TAG_ENTRY_LENGTH);

    const long = 'a'.repeat(MAX_TAG_NAME_LENGTH);
    expect(validateTag({ id: 'tag-01', name: long, kind: null })).toEqual([]);
  });

  it('refuses a name past its own limit', () => {
    const tooLong = 'a'.repeat(MAX_TAG_NAME_LENGTH + 1);

    expect(validateTag({ id: 'tag-01', name: tooLong, kind: null })).not.toEqual([]);
  });

  it('accepts a tag with no kind and a tag with any of the four', () => {
    expect(validateTag({ id: 'tag-01', name: 'brown butter', kind: null })).toEqual([]);
    for (const kind of TAG_KINDS) {
      expect(validateTag({ id: 'tag-01', name: 'butter', kind })).toEqual([]);
    }
  });

  it('refuses a kind that is not one of the four', () => {
    const issues = validateTag({
      id: 'tag-01',
      name: 'butter',
      kind: 'outcome' as never,
    });

    expect(issues.map((issue) => issue.code)).toContain('invalid_enum');
  });

  it('refuses a name that was not normalised on the way in', () => {
    const issues = validateTag({ id: 'tag-01', name: 'Brown Butter', kind: null });

    expect(issues.map((issue) => issue.field)).toContain('name');
  });

  it('refuses a blank name', () => {
    expect(validateTag({ id: 'tag-01', name: '', kind: null })).not.toEqual([]);
    expect(validateTag({ id: 'tag-01', name: '   ', kind: null })).not.toEqual([]);
  });
});

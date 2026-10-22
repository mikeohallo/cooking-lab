/**
 * One cook as text: everything the cook wrote appears exactly as written, the
 * structure is readable without the app, and a TEST-build file says so.
 */
import {
  cookExportFileName,
  renderCookAsText,
  renderEventLine,
  TEST_EXPORT_NOTICE,
} from '../src/data/export/cookText';
import type { Cook, CookEvent, Lesson, Tag } from '../src/domain/entities';
import { formatTime } from '../src/format/dateTime';

const cook: Cook = {
  id: 'cook-01',
  title: 'Pork chops, Tuesday',
  status: 'reviewed',
  provenance: 'live',
  parentCookId: null,
  startedAt: '2026-10-15T08:30:00.000Z',
  reviewOpenedAt: '2026-10-15T09:40:00.000Z',
  reviewSavedAt: '2026-10-15T09:45:00.000Z',
  verdict: '  Great crust.\n\nApple and cabbage needed acid.  ',
  createdAt: '2026-10-15T08:30:00.000Z',
};

const events: CookEvent[] = [
  {
    id: 'ev-01',
    cookId: 'cook-01',
    ts: '2026-10-15T08:31:00.000Z',
    kind: 'user_note',
    body: 'Dry brined overnight.',
    meta: null,
    photoPath: null,
  },
  {
    id: 'ev-02',
    cookId: 'cook-01',
    ts: '2026-10-15T08:50:00.000Z',
    kind: 'temp',
    body: null,
    meta: { celsius: 58, where: 'thickest part' },
    photoPath: null,
  },
  {
    id: 'ev-03',
    cookId: 'cook-01',
    ts: '2026-10-15T08:55:00.000Z',
    kind: 'temp',
    body: null,
    meta: { celsius: 62.5 },
    photoPath: null,
  },
  {
    id: 'ev-04',
    cookId: 'cook-01',
    ts: '2026-10-15T09:10:00.000Z',
    kind: 'photo',
    body: null,
    meta: null,
    photoPath: 'cooks/cook-01/ev-04.jpg',
  },
];

const lessons: Lesson[] = [
  {
    id: 'lesson-01',
    cookId: 'cook-01',
    text: 'More acid in the cabbage.',
    status: 'approved',
    provenance: 'live',
    createdAt: '2026-10-15T09:45:00.000Z',
    updatedAt: null,
  },
];

const EXPORTED_AT = '2026-10-16T06:00:00.000Z';

describe('renderCookAsText', () => {
  const text = renderCookAsText({ tags: [], cook, events, lessons, variant: 'production', exportedAt: EXPORTED_AT });

  it('leads with the title and the dates, year included', () => {
    expect(text.startsWith('Cooking Lab — Pork chops, Tuesday\n')).toBe(true);
    expect(text).toMatch(/^Started: \w{3} 15 Oct 2026, \d{1,2}:\d{2} [ap]m$/m);
    expect(text).toMatch(/^Reviewed: \w{3} 15 Oct 2026, \d{1,2}:\d{2} [ap]m$/m);
  });

  it('keeps the verdict exactly as stored, whitespace and all', () => {
    expect(text).toContain('Verdict\n  Great crust.\n\nApple and cabbage needed acid.  \n');
  });

  it('lists approved lessons under Next time', () => {
    expect(text).toContain('Next time\n- More acid in the cabbage.\n');
  });

  it('writes the timeline oldest first, readings in Celsius', () => {
    const timeline = text.slice(text.indexOf('Timeline\n'));
    const lines = timeline.split('\n').slice(1, 5);
    expect(lines[0]).toMatch(/^\d{1,2}:\d{2} [ap]m\s+Dry brined overnight\.$/);
    expect(lines[1]).toMatch(/^\d{1,2}:\d{2} [ap]m\s+58°C — thickest part$/);
    expect(lines[2]).toMatch(/^\d{1,2}:\d{2} [ap]m\s+62\.5°C$/);
    expect(lines[3]).toMatch(/^\d{1,2}:\d{2} [ap]m\s+\[Photo\]$/);
  });

  it('says where it came from and that nothing was changed', () => {
    expect(text).toMatch(/^Exported from Cooking Lab on \w{3} 16 Oct 2026, .*unchanged\.$/m);
  });

  it('carries no TEST notice in a production export', () => {
    expect(text).not.toContain(TEST_EXPORT_NOTICE);
    expect(text).not.toMatch(/\bTEST\b/);
  });

  it('labels a TEST-build export so it can never pass for real history', () => {
    const test = renderCookAsText({ tags: [], cook, events, lessons, variant: 'test', exportedAt: EXPORTED_AT });
    expect(test.split('\n')[3]).toBe(TEST_EXPORT_NOTICE);
  });

  it('says plainly when there is no verdict and nothing in the timeline', () => {
    const bare = renderCookAsText({
      tags: [],
      cook: { ...cook, title: null, verdict: null, reviewSavedAt: null },
      events: [],
      lessons: [],
      variant: 'production',
      exportedAt: EXPORTED_AT,
    });
    expect(bare.startsWith('Cooking Lab — Untitled cook\n')).toBe(true);
    expect(bare).toContain('Verdict\nNo verdict was written for this cook.\n');
    expect(bare).toContain('Timeline\nNothing was noted during this cook.\n');
    expect(bare).not.toContain('Next time');
  });

  it('marks an open cook as not yet reviewed', () => {
    const open = renderCookAsText({
      tags: [],
      cook: { ...cook, status: 'open', verdict: null, reviewOpenedAt: null, reviewSavedAt: null },
      events,
      lessons: [],
      variant: 'production',
      exportedAt: EXPORTED_AT,
    });
    expect(open).toContain('Status: still open — not yet reviewed\n');
    expect(open).toContain('Verdict\nNot reviewed yet.\n');
  });
});

describe('renderEventLine', () => {
  it('labels assistant and plan entries so they cannot pass for the cook’s words', () => {
    const base = events[0]!;
    expect(renderEventLine({ ...base, kind: 'assistant_msg', body: 'Try 60°C.' })).toMatch(
      /Assistant: Try 60°C\.$/,
    );
    expect(renderEventLine({ ...base, kind: 'plan', body: 'Rest ten minutes.' })).toMatch(
      /Plan: Rest ten minutes\.$/,
    );
  });
});

describe('cookExportFileName', () => {
  it('is short, safe and tells you which cook', () => {
    expect(cookExportFileName(cook, '2026-10-16', 'production')).toBe(
      'cooking-lab-cook-2026-10-16-pork-chops-tuesday.txt',
    );
  });

  it('copes with no title and with hostile characters', () => {
    expect(cookExportFileName({ ...cook, title: null }, '2026-10-16', 'production')).toBe(
      'cooking-lab-cook-2026-10-16.txt',
    );
    expect(cookExportFileName({ ...cook, title: '../../etc/passwd  🔥' }, '2026-10-16', 'production')).toBe(
      'cooking-lab-cook-2026-10-16-etc-passwd.txt',
    );
  });

  it('labels a TEST-build file in the name itself', () => {
    expect(cookExportFileName(cook, '2026-10-16', 'test')).toBe(
      'cooking-lab-TEST-cook-2026-10-16-pork-chops-tuesday.txt',
    );
  });
});

/**
 * Slice 3: the text file carries the cook's tags, says what each reading was
 * taken of, and lists the photographs it cannot show.
 */
describe('one cook as text, with tags, reading kinds and photos', () => {
  const tags: Tag[] = [
    { id: 'tag-01', name: 'pork chops', kind: null },
    { id: 'tag-02', name: 'brown butter', kind: null },
    { id: 'tag-03', name: 'cast iron', kind: 'equipment' },
  ];

  const readings: CookEvent[] = [
    {
      id: 'ev-oven',
      cookId: 'cook-01',
      ts: '2026-10-15T08:40:00.000Z',
      kind: 'temp',
      body: null,
      meta: { celsius: 230, readingKind: 'oven' },
      photoPath: null,
    },
    {
      id: 'ev-internal',
      cookId: 'cook-01',
      ts: '2026-10-15T08:50:00.000Z',
      kind: 'temp',
      body: null,
      meta: { celsius: 62.5, readingKind: 'internal' },
      photoPath: null,
    },
  ];

  // Oldest first, as the repository hands the timeline over.
  const timeline = [...events, ...readings].sort(
    (left, right) => Date.parse(left.ts) - Date.parse(right.ts),
  );

  const text = renderCookAsText({
    tags,
    cook,
    events: timeline,
    lessons,
    variant: 'production',
    exportedAt: EXPORTED_AT,
  });

  it('lists the tags, in the order the screen shows them', () => {
    expect(text).toContain('Tags: pork chops, brown butter, cast iron');
  });

  it('labels an oven reading and an internal one', () => {
    expect(renderEventLine(readings[0]!)).toContain('230°C — Oven');
    expect(renderEventLine(readings[1]!)).toContain('62.5°C — Internal');
  });

  it('says "Internal", never "Inside"', () => {
    expect(text).toContain('Internal');
    expect(text).not.toContain('Inside');
  });

  it('still shows the cook’s own words for a reading taken somewhere else', () => {
    // No kind to print, so the line reads exactly as it did in slice 2.
    expect(renderEventLine(events[1]!)).toContain('58°C — thickest part');
    expect(renderEventLine(events[1]!)).not.toContain('Oven');
    expect(renderEventLine(events[1]!)).not.toContain('Internal');
  });

  it('prints both the kind and the where when a reading has both', () => {
    const both: CookEvent = {
      ...readings[1]!,
      meta: { celsius: 62.5, where: 'thickest part', readingKind: 'internal' },
    };

    expect(renderEventLine(both)).toContain('62.5°C — Internal, thickest part');
  });

  it('lists the photographs by time, since it cannot show them', () => {
    // The time is the device's local time, as every other line in the file is,
    // so it is derived rather than written out.
    const photo = events.find((event) => event.kind === 'photo')!;

    expect(text).toContain(`Photos\nPhoto, ${formatTime(photo.ts)}\n`);
  });

  it('leaves out the tags and the photos when there are none', () => {
    const bare = renderCookAsText({
      tags: [],
      cook,
      events: [events[0]!],
      lessons: [],
      variant: 'production',
      exportedAt: EXPORTED_AT,
    });

    expect(bare).not.toContain('Tags:');
    expect(bare).not.toContain('Photos');
  });

  it('still keeps the verdict exactly as it was typed', () => {
    expect(text).toContain('  Great crust.\n\nApple and cabbage needed acid.  ');
  });
});

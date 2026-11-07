/**
 * The web preview's notebook (0.4.0, part 7). Web only. Synthetic data only.
 *
 * Written through the app's own services, exactly as the screens write, onto a
 * database the app's own migrations made — so what the preview draws is what
 * the app would draw for the same cooking. It covers every screen in the
 * 0.4.0 design pack:
 *
 * - two open cooks: one cooked a second time (Last time and Next time, an
 *   Oven and an Internal reading, notes with one of them edited, photos), and
 *   one cooked for the first time;
 * - twelve reviewed cooks across all five meals, some with a cuisine (one of
 *   them Other) and some without;
 * - ratings from "You" and "Guest" (the household) and "Guest 2" (a guest),
 *   with an N/A and a line;
 * - a third person in the household, "Guest with a longer name" (0.4.1), with
 *   no ratings yet: a name long enough to send Who ate it?'s controls under
 *   the names on a narrow window. Made up, and in the preview only.
 * - ingredients and tags;
 * - timers on the open muffins (0.5.0): Gravy, Veg and Meat running, and
 *   Rest, which has run out and is not yet stopped.
 *
 * Photos are flat colour blocks drawn in code (`ports.web.ts`); no image file
 * is involved. The only names are You, Guest, Guest 2 and Guest with a
 * longer name.
 */

import type { PrivateFileStore } from '../data/adapters';
import { buildPhotoLogicalPath } from '../data/photos/photoPaths';
import type { DataLayer } from '../data/repositories';
import type { Cuisine, StoredMealType } from '../domain/enums';
import type { EvidenceDecision, RatingAnswer, RatingPerson } from '../domain/evidence';
import { colourBytes } from './ports.web';

/** The records the preview's screens open. */
export const PREVIEW_IDS = {
  /** Open, cooked a second time: the cook page, Add a reading, note options, the review. */
  again: 'preview-cook-muffins-again',
  /** The note on `again` that has been edited, whose ⋯ opens note options. */
  editedNote: 'preview-note-apples',
  /** Open, cooked for the first time. */
  first: 'preview-cook-traybake',
  /** Reviewed, with all three ratings: the reviewed cook page. */
  reviewed: 'preview-cook-muffins',
  /** Reviewed, deleted on the Undo screen. */
  deleted: 'preview-cook-pancakes',
} as const;

/** The open cook's timers (0.5.0): Rest has run out; the other three are running. */
export const PREVIEW_TIMERS = {
  rest: 'preview-timer-rest',
  gravy: 'preview-timer-gravy',
  veg: 'preview-timer-veg',
  meat: 'preview-timer-meat',
} as const;

export const PREVIEW_MEMBERS = {
  you: 'preview-member-you',
  guest: 'preview-member-guest',
  longer: 'preview-member-longer',
} as const;

/** The third preview person (0.4.1): a long, made-up name, for Who ate it?'s layout. */
export const PREVIEW_LONGER_NAME = 'Guest with a longer name';

/** A guest who is not in the household, rated by name. */
export const PREVIEW_GUEST_NAME = 'Guest 2';

/** The words typed on the "No matches" screen: nothing in the notebook has them. */
export const PREVIEW_NO_MATCH_WORDS = 'Test nothing here';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type Rated = {
  readonly person: 'you' | 'guest' | 'guest2';
  readonly stars?: number;
  readonly notEaten?: boolean;
  readonly line?: string;
};

type ReviewedCook = {
  readonly id: string;
  readonly title: string;
  readonly daysAgo: number;
  readonly meal: StoredMealType;
  readonly cuisine?: Cuisine;
  readonly otherWords?: string;
  readonly colour?: string;
  readonly verdict: string;
  readonly ratings?: readonly Rated[];
  readonly tags?: readonly string[];
  readonly ingredients?: string;
  readonly nextTime?: readonly string[];
  readonly note?: string;
};

const MUFFIN_INGREDIENTS = [
  '2 apples, grated',
  '250 g plain flour',
  '2 tsp baking powder',
  '1½ tsp cinnamon',
  '¼ tsp salt',
  '120 g brown sugar',
  '2 eggs',
  '120 g butter, melted',
  '180 g Greek yoghurt',
  '1 tsp vanilla',
].join('\n');

/** Twelve reviewed cooks, newest first, across all five meals. */
const REVIEWED: readonly ReviewedCook[] = [
  {
    id: PREVIEW_IDS.reviewed,
    title: 'Easy apple-cinnamon muffins',
    daysAgo: 6,
    meal: 'breakfast',
    cuisine: 'american',
    colour: '#c98a4b',
    verdict: 'Really tasty. A little dense in the middle.',
    ratings: [
      { person: 'you', stars: 4 },
      { person: 'guest', stars: 5, line: 'Best batch yet.' },
      { person: 'guest2', notEaten: true },
    ],
    tags: ['baking', 'make ahead'],
    ingredients: MUFFIN_INGREDIENTS,
    nextTime: ['Don’t squeeze the apples.', 'Add a few choc chips.'],
    note: 'Grated the apples straight into the bowl.',
  },
  {
    id: 'preview-cook-pancakes',
    title: 'Fluffy pancakes',
    daysAgo: 8,
    meal: 'breakfast',
    colour: '#e3b766',
    verdict: 'Fluffy. Pan a touch too hot for the first few.',
  },
  {
    id: 'preview-cook-risotto',
    title: 'Mushroom risotto',
    daysAgo: 10,
    meal: 'lunch_dinner',
    cuisine: 'italian',
    colour: '#a89272',
    verdict: 'Creamy, good bite to the rice.',
    ratings: [
      { person: 'you', stars: 4 },
      { person: 'guest', stars: 3, line: 'A bit salty.' },
    ],
    tags: ['weeknight'],
    nextTime: ['Half the stock cube.'],
  },
  {
    id: 'preview-cook-tart',
    title: 'Lemon tart',
    daysAgo: 13,
    meal: 'dessert',
    cuisine: 'french',
    colour: '#e8cf5a',
    verdict: 'Sharp and smooth. Pastry held.',
    ratings: [
      { person: 'you', stars: 5 },
      { person: 'guest', stars: 4 },
    ],
    tags: ['baking'],
  },
  {
    id: 'preview-cook-potatoes',
    title: 'Garlic roast potatoes',
    daysAgo: 15,
    meal: 'side',
    colour: '#d1a24a',
    verdict: 'Crisp outside, fluffy inside.',
    ratings: [
      { person: 'you', stars: 5 },
      { person: 'guest', stars: 5 },
    ],
  },
  {
    id: 'preview-cook-katsu',
    title: 'Chicken katsu curry',
    daysAgo: 18,
    meal: 'lunch_dinner',
    cuisine: 'japanese',
    colour: '#b9783a',
    verdict: 'Crunchy. Sauce could be thicker.',
    ratings: [{ person: 'you', stars: 4 }],
    tags: ['weeknight'],
  },
  {
    id: 'preview-cook-flapjacks',
    title: 'Oat flapjacks',
    daysAgo: 21,
    meal: 'snack',
    cuisine: 'other',
    otherWords: 'British',
    colour: '#b08850',
    verdict: 'Chewy. Cut them while warm.',
    ratings: [
      { person: 'you', stars: 3 },
      { person: 'guest2', stars: 4, line: 'Lovely with tea.' },
    ],
    tags: ['make ahead'],
  },
  {
    id: 'preview-cook-shakshuka',
    title: 'Shakshuka',
    daysAgo: 24,
    meal: 'breakfast',
    cuisine: 'middle_eastern',
    colour: '#c4472f',
    verdict: 'Eggs just set. More cumin.',
    ratings: [
      { person: 'you', stars: 4 },
      { person: 'guest', stars: 4 },
    ],
  },
  {
    id: 'preview-cook-salad',
    title: 'Greek salad',
    daysAgo: 27,
    meal: 'side',
    cuisine: 'greek',
    verdict: 'Fresh. Salt the tomatoes first.',
  },
  {
    id: 'preview-cook-tacos',
    title: 'Beef tacos',
    daysAgo: 31,
    meal: 'lunch_dinner',
    cuisine: 'mexican',
    colour: '#a0522d',
    verdict: 'Good spice. Tortillas warmed in the pan.',
    ratings: [
      { person: 'you', stars: 4 },
      { person: 'guest2', stars: 5 },
    ],
    tags: ['spicy'],
  },
  {
    id: 'preview-cook-banana',
    title: 'Banana bread',
    daysAgo: 36,
    meal: 'snack',
    colour: '#9c6b3c',
    verdict: 'Moist. Ten minutes less next time.',
    ratings: [{ person: 'you', stars: 3 }],
    tags: ['baking'],
  },
  {
    id: 'preview-cook-padthai',
    title: 'Prawn pad thai',
    daysAgo: 41,
    meal: 'lunch_dinner',
    cuisine: 'thai',
    colour: '#d08b3e',
    verdict: 'Noodles a little soft.',
    ratings: [
      { person: 'you', stars: 3 },
      { person: 'guest', notEaten: true, line: 'Not a prawn fan.' },
    ],
    tags: ['spicy', 'weeknight'],
  },
];

function granted<T>(decision: EvidenceDecision<T>, what: string): T {
  if (!decision.allowed) {
    throw new Error(`the preview notebook could not ${what}: ${decision.message}`);
  }
  return decision.record;
}

export type PreviewSeedTarget = {
  readonly data: DataLayer;
  readonly photos: PrivateFileStore;
};

/**
 * Fill an empty notebook with the preview's cooking.
 *
 * `now` is the moment the preview treats as now: the open cooks were started
 * this morning, the reviewed ones over the six weeks before.
 */
export async function seedPreviewNotebook(target: PreviewSeedTarget, now: number): Promise<void> {
  const { data, photos } = target;
  let sequence = 0;
  const id = (prefix: string) => {
    sequence += 1;
    return `preview-${prefix}-${String(sequence).padStart(3, '0')}`;
  };
  const iso = (at: number) => new Date(at).toISOString();

  // The household, in order: You, Guest, then Guest with a longer name.
  granted(await data.householdWorkflow.add('You', { id: PREVIEW_MEMBERS.you }, iso(now - 60 * DAY)), 'add You');
  granted(await data.householdWorkflow.add('Guest', { id: PREVIEW_MEMBERS.guest }, iso(now - 60 * DAY)), 'add Guest');
  granted(
    await data.householdWorkflow.add(PREVIEW_LONGER_NAME, { id: PREVIEW_MEMBERS.longer }, iso(now - 60 * DAY)),
    'add Guest with a longer name',
  );

  const personOf = (rated: Rated): RatingPerson => {
    switch (rated.person) {
      case 'you':
        return { memberId: PREVIEW_MEMBERS.you };
      case 'guest':
        return { memberId: PREVIEW_MEMBERS.guest };
      default:
        return { guestName: PREVIEW_GUEST_NAME };
    }
  };

  const addPhoto = async (cookId: string, colour: string, at: number) => {
    const eventId = id('photo');
    const built = buildPhotoLogicalPath({
      cookId,
      cookEventId: eventId,
      capturedAt: iso(at),
      sequence: 0,
      extension: 'jpg',
    });
    if (!built.ok) {
      throw new Error(`the preview notebook could not name a photo: ${built.reason}`);
    }
    await photos.write(built.path, colourBytes(colour));
    granted(
      await data.capture.addEvent({ id: eventId, cookId, ts: iso(at), kind: 'photo', photoPath: built.path }, 'user'),
      'add a photo',
    );
  };

  const addTags = async (cookId: string, names: readonly string[]) => {
    for (const name of names) {
      const tag = await data.tags.findOrCreate(name, null);
      await data.cookTags.link({ cookId, tagId: tag.id });
    }
  };

  // Oldest first, so the notebook fills in the order it was cooked.
  for (const cook of [...REVIEWED].reverse()) {
    const started = now - cook.daysAgo * DAY - 6 * HOUR;
    let at = started;
    const tick = () => {
      at += 7 * MINUTE;
      return iso(at);
    };
    granted(await data.capture.startCook({ id: cook.id, title: cook.title, startedAt: iso(started) }, 'user', iso(started)), 'start a cook');
    granted(await data.cookRecord.setMealType(cook.id, cook.meal, 'user', tick()), 'set a meal');
    if (cook.cuisine !== undefined) {
      granted(await data.cookRecord.setCuisine(cook.id, cook.cuisine, cook.otherWords ?? null, 'user', tick()), 'set a cuisine');
    }
    if (cook.ingredients !== undefined) {
      granted(await data.cookRecord.saveIngredients(cook.id, cook.ingredients, { id: id('ingredients') }, 'user', tick()), 'save ingredients');
    }
    if (cook.tags !== undefined) {
      await addTags(cook.id, cook.tags);
    }
    if (cook.note !== undefined) {
      granted(await data.capture.addEvent({ id: id('note'), cookId: cook.id, ts: tick(), kind: 'user_note', body: cook.note }, 'user'), 'add a note');
    }
    if (cook.colour !== undefined) {
      tick();
      await addPhoto(cook.id, cook.colour, at);
    }
    for (const rated of cook.ratings ?? []) {
      const answer: RatingAnswer = {
        stars: rated.stars ?? null,
        notEaten: rated.notEaten ?? false,
        line: rated.line ?? null,
      };
      granted(await data.cookRecord.rate(cook.id, personOf(rated), answer, { id: id('rating') }, 'user', tick()), 'add a rating');
    }
    for (const line of cook.nextTime ?? []) {
      granted(await data.cookRecord.addNextTime(cook.id, line, { id: id('next') }, 'user', tick()), 'add a next-time line');
    }
    granted(await data.capture.openReview(cook.id, 'user', tick()), 'open a review');
    granted(await data.capture.saveReview(cook.id, cook.verdict, 'user', tick()), 'save a review');
  }

  // Open, first time: started an hour and a half ago.
  const firstStarted = now - 90 * MINUTE;
  granted(
    await data.capture.startCook(
      { id: PREVIEW_IDS.first, title: 'Weeknight chicken traybake', startedAt: iso(firstStarted) },
      'user',
      iso(firstStarted),
    ),
    'start the traybake',
  );
  granted(await data.cookRecord.setMealType(PREVIEW_IDS.first, 'lunch_dinner', 'user', iso(firstStarted + MINUTE)), 'set a meal');
  await addTags(PREVIEW_IDS.first, ['weeknight']);
  granted(
    await data.capture.addEvent(
      { id: id('note'), cookId: PREVIEW_IDS.first, ts: iso(firstStarted + 20 * MINUTE), kind: 'user_note', body: 'Lemon and thyme on the thighs.' },
      'user',
    ),
    'add a note',
  );
  await addPhoto(PREVIEW_IDS.first, '#b5703c', firstStarted + 40 * MINUTE);

  // Open, the second time: the muffins again, started forty minutes ago.
  const againStarted = now - 40 * MINUTE;
  granted(
    await data.cookRecord.cookAgain(
      PREVIEW_IDS.reviewed,
      { id: PREVIEW_IDS.again, ingredientsId: id('ingredients') },
      'user',
      iso(againStarted),
    ),
    'cook the muffins again',
  );
  const event = async (at: number, extra: { kind: 'temp' | 'user_note'; body?: string; meta?: Record<string, string | number>; id?: string }) =>
    granted(
      await data.capture.addEvent(
        { id: extra.id ?? id(extra.kind === 'temp' ? 'reading' : 'note'), cookId: PREVIEW_IDS.again, ts: iso(at), kind: extra.kind, body: extra.body ?? null, meta: extra.meta ?? null },
        'user',
      ),
      'add to the cook',
    );
  await event(againStarted + 2 * MINUTE, { kind: 'temp', meta: { celsius: 180, readingKind: 'oven' } });
  await event(againStarted + 4 * MINUTE, { kind: 'user_note', id: PREVIEW_IDS.editedNote, body: 'Grated the apples.' });
  granted(
    await data.capture.reviseNote(
      PREVIEW_IDS.editedNote,
      'Grated both apples, and didn’t squeeze them.',
      { id: id('revision') },
      'user',
      iso(againStarted + 6 * MINUTE),
    ),
    'edit a note',
  );
  await event(againStarted + 9 * MINUTE, { kind: 'user_note', body: 'Choc chips into half the batter.' });
  await addPhoto(PREVIEW_IDS.again, '#c48a52', againStarted + 12 * MINUTE);
  await addPhoto(PREVIEW_IDS.again, '#8f5a33', againStarted + 30 * MINUTE);
  await event(againStarted + 34 * MINUTE, { kind: 'temp', meta: { celsius: 96, readingKind: 'internal' } });

  // Timers (0.5.0), through the timer service as the screens start them:
  // three running on the open cook, and Rest, which ran out five minutes ago
  // and has not been stopped yet. Each is started so much before now that
  // it has the time left the approved pictures show.
  const SECOND = 1_000;
  const timer = async (timerId: string, name: string, minutes: number, left: number) =>
    granted(
      await data.timerWorkflow.start(PREVIEW_IDS.again, name, minutes * MINUTE, { id: timerId }, 'user', iso(now - (minutes * MINUTE - left))),
      `start ${name}`,
    );
  const rest = await timer(PREVIEW_TIMERS.rest, 'Rest', 15, -5 * MINUTE);
  granted(await data.timerWorkflow.finish(rest.id, rest.endsAt, 'user'), 'Rest ran out');
  await timer(PREVIEW_TIMERS.gravy, 'Gravy', 10, 4 * MINUTE + 5 * SECOND);
  await timer(PREVIEW_TIMERS.veg, 'Veg', 25, 11 * MINUTE + 40 * SECOND);
  await timer(PREVIEW_TIMERS.meat, 'Meat', 180, 146 * MINUTE + 41 * SECOND);
}

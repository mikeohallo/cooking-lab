/**
 * The web preview (0.4.0, part 7): its notebook, its URL options, and every
 * `?screen=` drawn without error.
 *
 * The preview's own files are web-only (`.web.ts`, `.web.tsx`); they are
 * imported here by name so the suite runs them on the Node SQLite harness, on
 * the same migrations and services the browser uses. Each screen is opened as
 * the preview opens it, and its steps are run with the testing library where
 * the browser runs them on the page.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { CookingLabStorage } from '../src/data/runtime';
import { STORED_MEAL_TYPES } from '../src/domain/enums';
import { scaleTypeInPlace } from '../src/preview/typeScale.web';
import {
  PREVIEW_SCREENS,
  carriedQuery,
  parsePreviewOptions,
  type PreviewScreenName,
} from '../src/preview/options.web';
import { colourBlockUri, colourBytes } from '../src/preview/ports.web';
import {
  PREVIEW_PLANS,
  PreviewScreenView,
  PreviewSteps,
  type PreviewPerformer,
} from '../src/preview/PreviewScreen.web';
import { PREVIEW_GUEST_NAME, PREVIEW_IDS, PREVIEW_LONGER_NAME, PREVIEW_MEMBERS } from '../src/preview/seed.web';
import { openPreviewStorage } from '../src/preview/storage.web';
import { setPosture } from '../modules/cook-timers/mocks/CookTimersModule';
import { PendingDeletionProvider } from '../src/state/PendingDeletion';
import { ReadyStorageProvider, type AppStorage } from '../src/state/StorageProvider';
import { type } from '../src/theme/tokens';
import { countingIds } from './support/database';
import { memoryFileSystem, nodeDigest } from './support/memoryPorts';
import { createNodeSqliteHarness, type NodeSqliteHarness } from './support/nodeSqlite';
import { TEST_SAFE_AREA } from './support/screens';

const NOW = Date.parse('2026-11-02T09:40:00.000Z');

let harness: NodeSqliteHarness;
let opened: CookingLabStorage | null = null;

beforeEach(() => {
  harness = createNodeSqliteHarness();
});

afterEach(async () => {
  await opened?.close();
  opened = null;
  harness.closeAll();
});

async function notebook(filled = true): Promise<CookingLabStorage> {
  const result = await openPreviewStorage({
    open: harness.open,
    digest: nodeDigest,
    newId: countingIds('id'),
    now: () => NOW,
    filled,
  });
  if (!result.ok) {
    throw new Error(result.message);
  }
  opened = result.storage;
  return result.storage;
}

function appStorage(storage: CookingLabStorage): AppStorage {
  return {
    data: storage.data,
    assistant: storage.assistant,
    exporter: storage.exporter,
    photos: storage.photos,
    photoWorkflow: storage.photoWorkflow,
    deletions: storage.deletions,
    noteDeletions: storage.noteDeletions,
    newId: countingIds('new'),
    now: () => new Date(NOW).toISOString(),
  };
}

/** Steps start from an effect, so the first may come before `render` returns. */
let rendered: Promise<void> = Promise.resolve();

const performWithTestingLibrary: PreviewPerformer = async (step) => {
  await rendered;
  const target = await screen.findByTestId(step.testID);
  if (step.kind === 'press') {
    await fireEvent.press(target);
  } else {
    await fireEvent.changeText(target, step.text);
  }
};

describe('the preview’s URL options', () => {
  it('reads every screen, the theme and the font scale, and ignores anything else', () => {
    for (const name of PREVIEW_SCREENS) {
      expect(parsePreviewOptions(`?screen=${name}`).screen).toBe(name);
    }
    expect(parsePreviewOptions('?screen=nowhere').screen).toBeNull();
    expect(parsePreviewOptions('').screen).toBeNull();
    expect(parsePreviewOptions('?theme=dark').theme).toBe('dark');
    expect(parsePreviewOptions('?theme=light').theme).toBe('light');
    expect(parsePreviewOptions('?theme=sepia').theme).toBeNull();
    expect(parsePreviewOptions('?fontScale=1.15').fontScale).toBe(1.15);
    expect(parsePreviewOptions('?fontScale=9').fontScale).toBe(1);
    expect(parsePreviewOptions('?fontScale=big').fontScale).toBe(1);
    expect(parsePreviewOptions('').fontScale).toBe(1);
  });

  it('carries the theme and font scale to the app’s own pages, and not the screen', () => {
    expect(carriedQuery(parsePreviewOptions('?screen=cook&theme=dark&fontScale=1.3'))).toBe('?theme=dark&fontScale=1.3');
    expect(carriedQuery(parsePreviewOptions('?screen=cook'))).toBe('');
  });

  it('opens a plan for every screen it accepts, and no other', () => {
    expect(Object.keys(PREVIEW_PLANS).sort()).toEqual([...PREVIEW_SCREENS].sort());
  });

  it('multiplies every text style’s size and line height, and leaves 1 alone', () => {
    const rows = { body: { fontSize: 16, lineHeight: 22, fontWeight: '400' }, label: { fontSize: 12, lineHeight: 16 } };
    scaleTypeInPlace(rows, 1);
    expect(rows.body).toEqual({ fontSize: 16, lineHeight: 22, fontWeight: '400' });
    scaleTypeInPlace(rows, 1.15);
    expect(rows.body).toEqual({ fontSize: 18.4, lineHeight: 25.3, fontWeight: '400' });
    expect(rows.label).toEqual({ fontSize: 13.8, lineHeight: 18.4 });
  });

  it('never scales the app’s own type outside a browser', () => {
    // Body is 15 since 0.4.1's step down; unscaled here, as on Android.
    expect(type.body.fontSize).toBe(15);
    expect(type.body.lineHeight).toBe(21);
  });
});

describe('the preview’s photos', () => {
  it('are a colour drawn in code, never an image file', async () => {
    expect(colourBlockUri('#c98a4b')).toMatch(/^data:image\/svg\+xml;utf8,<svg .*fill="#c98a4b".*<\/svg>$/);
    expect(() => colourBytes('cat.jpg')).toThrow();
    const storage = await notebook();
    const all = await storage.photos.list();
    expect(all.length).toBeGreaterThan(0);
    for (const photo of all) {
      expect(String.fromCharCode(...(await storage.photos.read(photo.logicalPath)))).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('keeps no file of its own: the test ports never see one', () => {
    // The preview's photos live in its own in-memory port, not the phone's file system.
    expect(memoryFileSystem().files.size).toBe(0);
  });
});

describe('the preview notebook', () => {
  it('is made by the app’s own migrations, unencrypted and in memory', async () => {
    const storage = await notebook();
    const state = await storage.data.schemaState.read();
    expect(state.schemaVersion).toBe(storage.schemaVersion);
    expect(storage.schemaVersion).toBeGreaterThanOrEqual(5);
  });

  it('has two open cooks, one of them a second time, and twelve reviewed ones across all five meals', async () => {
    const { data } = await notebook();
    const open = await data.cooks.list({ status: 'open' });
    const reviewed = await data.cooks.list({ status: 'reviewed' });
    expect(open.map((cook) => cook.id).sort()).toEqual([PREVIEW_IDS.again, PREVIEW_IDS.first].sort());
    expect(open.find((cook) => cook.id === PREVIEW_IDS.again)?.parentCookId).toBe(PREVIEW_IDS.reviewed);
    expect(reviewed).toHaveLength(12);
    const meals = await data.mealTypes.listForCooks(reviewed.map((cook) => cook.id));
    expect(new Set(meals.map((row) => row.mealType))).toEqual(new Set(STORED_MEAL_TYPES));
    const cuisines = await data.cuisines.listForCooks(reviewed.map((cook) => cook.id));
    expect(cuisines.length).toBeGreaterThan(0);
    expect(cuisines.length).toBeLessThan(reviewed.length);
    expect(cuisines.some((row) => row.cuisine === 'other' && row.otherWords !== null)).toBe(true);
  });

  it('has ratings from You, Guest and Guest 2, with an N/A and a line, and no other names', async () => {
    const { data } = await notebook();
    const members = await data.household.list();
    // The third preview person (0.4.1) is in the household, with no ratings yet.
    expect(members.map((member) => member.name)).toEqual(['You', 'Guest', PREVIEW_LONGER_NAME]);
    const cooks = await data.cooks.list();
    const ratings = await data.ratings.listForCooks(cooks.map((cook) => cook.id));
    const byMember = new Set(ratings.map((rating) => rating.memberId).filter((id) => id !== null));
    expect(byMember).toEqual(new Set([PREVIEW_MEMBERS.you, PREVIEW_MEMBERS.guest]));
    expect(await data.ratings.listGuestNames()).toEqual([PREVIEW_GUEST_NAME]);
    expect(ratings.some((rating) => rating.notEaten)).toBe(true);
    expect(ratings.some((rating) => rating.line !== null)).toBe(true);
  });

  it('has notes (one edited), Oven and Internal readings, ingredients, tags and Next time', async () => {
    const { data } = await notebook();
    const events = await data.cookEvents.listForCook({ cookId: PREVIEW_IDS.again });
    const readings = events.filter((event) => event.kind === 'temp').map((event) => (event.meta as { readingKind?: string }).readingKind);
    expect(readings.sort()).toEqual(['internal', 'oven']);
    expect(events.filter((event) => event.kind === 'user_note').length).toBeGreaterThanOrEqual(2);
    expect(events.filter((event) => event.kind === 'photo').length).toBeGreaterThanOrEqual(2);
    const revisions = await data.revisions.listForCook(PREVIEW_IDS.again);
    expect(revisions.some((revision) => revision.cookEventId === PREVIEW_IDS.editedNote)).toBe(true);
    expect(await data.ingredients.listForCook(PREVIEW_IDS.again)).not.toHaveLength(0);
    expect(await data.cookTags.listForCook(PREVIEW_IDS.again)).not.toHaveLength(0);
    expect(await data.lessons.list({ cookId: PREVIEW_IDS.reviewed })).not.toHaveLength(0);
  });

  it('is empty when the empty screen asks for it', async () => {
    const { data } = await notebook(false);
    expect(await data.cooks.count()).toBe(0);
  });
});

describe('every ?screen=', () => {
  it.each(PREVIEW_SCREENS)('%s draws, and its steps reach the state the design shows', async (name: PreviewScreenName) => {
    const plan = PREVIEW_PLANS[name];
    const storage = appStorage(await notebook(name !== 'empty'));
    // Tabletop mode's screens: the screen half folded, as the module reports it (0.5.0).
    if (plan.tabletop) {
      setPosture({ tabletop: true, foldTop: 376, foldBottom: 376 });
    }
    const errors = jest.spyOn(console, 'error');
    let finished: string | null | undefined;
    let markRendered: () => void = () => {};
    rendered = new Promise((resolve) => {
      markRendered = resolve;
    });
    await render(
      <SafeAreaProvider initialMetrics={TEST_SAFE_AREA}>
        <ReadyStorageProvider storage={storage}>
          <PendingDeletionProvider>
            <PreviewScreenView view={plan.view} go={() => {}} />
            <PreviewSteps
              steps={plan.steps}
              perform={performWithTestingLibrary}
              onDone={(problem) => {
                finished = problem;
              }}
            />
          </PendingDeletionProvider>
        </ReadyStorageProvider>
      </SafeAreaProvider>,
    );
    markRendered();
    expect(await screen.findByTestId(plan.ready)).toBeTruthy();
    await waitFor(() => expect(finished).toBeNull());
    expect(await screen.findByTestId(plan.shows)).toBeTruthy();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

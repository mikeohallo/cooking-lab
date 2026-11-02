/**
 * Every pressable keeps a 48 dp touch area (0.4.0, part 7).
 *
 * The scale pass shrank what is drawn to Material 3's sizes — buttons about
 * 40 tall, chips 32, round icon buttons 40 or less — and kept the touch area
 * at 48 with a hit area around the control (`src/theme/touch.ts`). This
 * draws every screen of the web preview, on the cover display and on the inner
 * one, with its sheets open, and measures every control a finger can press:
 * its drawn height (the style's height or minimum height, or its padding and
 * its tallest line of words) plus its hit area above and below must be 48 or
 * more, and so must its width plus its hit area either side, where the width
 * is fixed. A control whose width comes from its words is wide enough.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { CookingLabStorage } from '../src/data/runtime';
import { PREVIEW_SCREENS, type PreviewScreenName } from '../src/preview/options.web';
import { PREVIEW_PLANS, PreviewScreenView, PreviewSteps, type PreviewPerformer } from '../src/preview/PreviewScreen.web';
import { PREVIEW_IDS } from '../src/preview/seed.web';
import { openPreviewStorage } from '../src/preview/storage.web';
import { PendingDeletionProvider } from '../src/state/PendingDeletion';
import { ReadyStorageProvider } from '../src/state/StorageProvider';
import { TOUCH_AREA, touchSlop } from '../src/theme/touch';
import { size } from '../src/theme/tokens';
import { countingIds } from './support/database';
import { nodeDigest } from './support/memoryPorts';
import { createNodeSqliteHarness, type NodeSqliteHarness } from './support/nodeSqlite';
import { TEST_SAFE_AREA } from './support/screens';

type Figures = { width: number; height: number; scale: number; fontScale: number };

const COVER: Figures = { width: 369, height: 905, scale: 2.625, fontScale: 1 };
const INNER: Figures = { width: 792, height: 880, scale: 2.625, fontScale: 1 };

const mockWindow: { figures: Figures } = { figures: COVER };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow.figures,
}));

const NOW = Date.parse('2026-11-02T09:40:00.000Z');

type Node = {
  type: string;
  props: Record<string, unknown>;
  children: (Node | string)[] | null;
};

type Measured = { readonly id: string; readonly height: number; readonly width: number | null; readonly words: boolean };

const num = (value: unknown): number => (typeof value === 'number' ? value : 0);

function slopOf(value: unknown): { top: number; bottom: number; left: number; right: number } {
  if (typeof value === 'number') {
    return { top: value, bottom: value, left: value, right: value };
  }
  const insets = (value ?? {}) as Record<string, unknown>;
  return { top: num(insets.top), bottom: num(insets.bottom), left: num(insets.left), right: num(insets.right) };
}

function styleOf(node: Node): Record<string, unknown> {
  return (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
}

/** The tallest line of words, and the widest fixed-size child, inside a node. */
function contents(node: Node): { line: number; width: number; words: boolean } {
  let line = 0;
  let width = 0;
  let words = false;
  const walk = (at: Node | string) => {
    if (typeof at === 'string') {
      words = words || at.trim() !== '';
      return;
    }
    const style = styleOf(at);
    if (at.type === 'Text') {
      line = Math.max(line, num(style.lineHeight));
    }
    width = Math.max(width, num(style.width), num(at.props.width));
    line = Math.max(line, num(style.height), num(at.props.height));
    for (const child of at.children ?? []) {
      walk(child);
    }
  };
  for (const child of node.children ?? []) {
    walk(child);
  }
  return { line, width, words };
}

function padding(style: Record<string, unknown>, side: 'Top' | 'Bottom' | 'Left' | 'Right'): number {
  const axis = side === 'Top' || side === 'Bottom' ? 'paddingVertical' : 'paddingHorizontal';
  return num(style[`padding${side}`] ?? style[axis] ?? style.padding) + num(style[`border${side}Width`] ?? style.borderWidth);
}

/**
 * Two shapes Jest cannot measure, because the layout sizes them: a scrim (a
 * pressable with nothing in it that takes all the room left, `flex`) and a
 * photo tile (a square share of its row, `flex` and `aspectRatio`). A scrim
 * fills the screen above its sheet; a tile is a third of a column or more.
 */
function laidOutByItsContainer(node: Node, style: Record<string, unknown>): boolean {
  if (style.position === 'absolute' && style.top === 0 && style.bottom === 0) {
    return true;
  }
  if (num(style.flex) <= 0) {
    return false;
  }
  return style.aspectRatio !== undefined || (node.children ?? []).length === 0;
}

function measure(node: Node, index: number): Measured {
  const style = styleOf(node);
  const slop = slopOf(node.props.hitSlop);
  const inside = contents(node);
  const id = String(node.props.testID ?? node.props.accessibilityLabel ?? `#${index}`);
  if (laidOutByItsContainer(node, style)) {
    return { id, height: Number.POSITIVE_INFINITY, width: null, words: inside.words };
  }
  const drawnHeight = Math.max(
    num(style.height),
    num(style.minHeight),
    padding(style, 'Top') + padding(style, 'Bottom') + inside.line,
  );
  const fixedWidth = Math.max(num(style.width), num(style.minWidth), num(style.flexBasis));
  const width = fixedWidth > 0 ? fixedWidth : inside.words ? null : padding(style, 'Left') + padding(style, 'Right') + inside.width;
  return {
    id,
    height: drawnHeight + slop.top + slop.bottom,
    width: width === null ? null : width + slop.left + slop.right,
    words: inside.words,
  };
}

/** Every host element a finger can press. */
function pressables(root: Node | Node[] | null): Node[] {
  const found: Node[] = [];
  const walk = (at: Node | string) => {
    if (typeof at === 'string') {
      return;
    }
    if (typeof at.props.onClick === 'function') {
      found.push(at);
    }
    for (const child of at.children ?? []) {
      walk(child);
    }
  };
  for (const node of Array.isArray(root) ? root : root === null ? [] : [root]) {
    walk(node);
  }
  return found;
}

let harness: NodeSqliteHarness;
let opened: CookingLabStorage | null = null;
let rendered: Promise<void> = Promise.resolve();

const perform: PreviewPerformer = async (step) => {
  await rendered;
  const target = await screen.findByTestId(step.testID);
  if (step.kind === 'press') {
    await fireEvent.press(target);
  } else {
    await fireEvent.changeText(target, step.text);
  }
};

beforeEach(() => {
  harness = createNodeSqliteHarness();
});

afterEach(async () => {
  await opened?.close();
  opened = null;
  harness.closeAll();
  mockWindow.figures = COVER;
});

/** A further tap, after the preview's own steps, to open what the preview does not. */
type More = { readonly press?: string; readonly longPress?: string; readonly shows: string };

async function draw(name: PreviewScreenName, figures: Figures, more: readonly More[] = []): Promise<readonly Measured[]> {
  mockWindow.figures = figures;
  const result = await openPreviewStorage({
    open: harness.open,
    digest: nodeDigest,
    newId: countingIds('id'),
    now: () => NOW,
    filled: name !== 'empty',
  });
  if (!result.ok) {
    throw new Error(result.message);
  }
  opened = result.storage;
  const plan = PREVIEW_PLANS[name];
  let finished: string | null | undefined;
  let markRendered: () => void = () => {};
  rendered = new Promise((resolve) => {
    markRendered = resolve;
  });
  await render(
    <SafeAreaProvider initialMetrics={TEST_SAFE_AREA}>
      <ReadyStorageProvider
        storage={{ ...result.storage, newId: countingIds('new'), now: () => new Date(NOW).toISOString() }}
      >
        <PendingDeletionProvider>
          <PreviewScreenView view={plan.view} go={() => {}} />
          <PreviewSteps
            steps={plan.steps}
            perform={perform}
            onDone={(problem) => {
              finished = problem;
            }}
          />
        </PendingDeletionProvider>
      </ReadyStorageProvider>
    </SafeAreaProvider>,
  );
  markRendered();
  await screen.findByTestId(plan.ready);
  await waitFor(() => expect(finished).toBeNull());
  await screen.findByTestId(plan.shows);
  for (const step of more) {
    if (step.press !== undefined) {
      await fireEvent.press(await screen.findByTestId(step.press));
    }
    if (step.longPress !== undefined) {
      await fireEvent(await screen.findByTestId(step.longPress), 'longPress');
    }
    await screen.findByTestId(step.shows);
  }
  await act(async () => {});
  return pressables(screen.toJSON() as Node | Node[] | null).map(measure);
}

describe('the touch area', () => {
  it('reaches 48 from any drawn size, evenly', () => {
    expect(TOUCH_AREA).toBe(48);
    expect(touchSlop(40)).toEqual({ top: 4, bottom: 4, left: 0, right: 0 });
    expect(touchSlop(32, 32)).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
    expect(touchSlop(size.targetMin)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
    expect(touchSlop(56)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
});

describe.each([
  ['the cover display', COVER],
  ['the inner display', INNER],
] as const)('every pressable on %s', (_where, figures) => {
  it.each(PREVIEW_SCREENS)('%s: keeps a 48 dp touch area', async (name) => {
    const measured = await draw(name, figures);
    expect(measured.length).toBeGreaterThan(0);
    const short = measured
      .filter((control) => control.height < TOUCH_AREA || (control.width !== null && control.width < TOUCH_AREA))
      .map((control) => `${control.id}: ${control.width ?? 'words'} × ${control.height}`);
    expect(short).toEqual([]);
  });

  /** Sheets, menus and editors a person opens from those screens. */
  const FURTHER: readonly (readonly [string, PreviewScreenName, readonly More[]])[] = [
    ['Home’s menu', 'home', [{ press: 'home-more', shows: 'whos-eating' }]],
    ['a cook’s actions, and Delete’s confirm', 'home', [
      { longPress: `cook-card-${PREVIEW_IDS.first}`, shows: 'delete-cook' },
      { press: 'delete-cook', shows: 'delete-cook-confirm-button' },
    ]],
    ['Add a photo', 'cook', [{ press: 'add-photo', shows: 'take-photo' }]],
    ['the tag editor', 'cook', [{ press: 'tag-open', shows: 'tag-add' }]],
    ['the title editor', 'cook', [{ press: 'cook-title', shows: 'cook-title-save' }]],
    ['a note’s earlier versions', 'note-options', [{ press: `note-${PREVIEW_IDS.editedNote}-versions`, shows: 'versions-close' }]],
    ['a reviewed cook’s menu', 'reviewed', [{ press: 'cook-more', shows: 'export-cook' }]],
  ];

  it.each(FURTHER)('%s: keeps a 48 dp touch area', async (_what, name, more) => {
    const measured = await draw(name, figures, more);
    const short = measured
      .filter((control) => control.height < TOUCH_AREA || (control.width !== null && control.width < TOUCH_AREA))
      .map((control) => `${control.id}: ${control.width ?? 'words'} × ${control.height}`);
    expect(short).toEqual([]);
  });
});

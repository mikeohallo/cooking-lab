/**
 * No two controls' 48 dp touch areas overlap (0.4.1).
 *
 * Material 3 draws a chip 32 tall and a button 40, and each reaches out to a
 * 48 dp touch area with its hit area (`src/theme/touch.ts`). Two rows of chips
 * 8 apart would then share 8 dp of touch area: a tap there could go to either.
 * So rows of wrapped controls sit at least 16 apart (`space.md`).
 *
 * Jest has no layout engine, so this works from the drawn tree, the way the
 * layout would place it: for every view holding two or more things side by
 * side or one above another, it works out how far each one's touch area
 * reaches past its edge (a control's hit area, less any padding or margin
 * between it and that edge) and holds the space between neighbours to the sum
 * of the two reaches. A row that wraps may wrap anywhere, so every pair in it
 * is held to the row gap above and below as well as the column gap beside.
 * Every screen of the web preview is drawn, on the cover display and the inner
 * one, with its sheets and editors open.
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
import { space } from '../src/theme/tokens';
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

type Side = 'top' | 'bottom' | 'left' | 'right';
type Reach = Record<Side, number>;

/** No control at that edge. */
const NONE = Number.NEGATIVE_INFINITY;
const NO_REACH: Reach = { top: NONE, bottom: NONE, left: NONE, right: NONE };

const num = (value: unknown): number => (typeof value === 'number' ? value : 0);

function styleOf(node: Node): Record<string, unknown> {
  return (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
}

function slopOf(value: unknown): Reach {
  if (typeof value === 'number') {
    return { top: value, bottom: value, left: value, right: value };
  }
  const insets = (value ?? {}) as Record<string, unknown>;
  return { top: num(insets.top), bottom: num(insets.bottom), left: num(insets.left), right: num(insets.right) };
}

const CAP: Record<Side, string> = { top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right' };

function inset(style: Record<string, unknown>, kind: 'padding' | 'margin', side: Side): number {
  const axis = side === 'top' || side === 'bottom' ? `${kind}Vertical` : `${kind}Horizontal`;
  return num(style[`${kind}${CAP[side]}`] ?? style[axis] ?? style[kind]);
}

function border(style: Record<string, unknown>, side: Side): number {
  return num(style[`border${CAP[side]}Width`] ?? style.borderWidth);
}

const isControl = (node: Node) => typeof node.props.onClick === 'function';

/** Drawn over the rest, not in the flow: a sheet, a scrim, a fade. Checked on its own. */
function overlay(node: Node): boolean {
  return node.type === 'Modal' || styleOf(node).position === 'absolute';
}

/** The children the layout places in the flow: not text, not drawn over the rest, not hidden. */
function placed(node: Node): Node[] {
  if (node.type === 'Text') {
    return [];
  }
  return (node.children ?? []).filter(
    (child): child is Node => typeof child !== 'string' && !overlay(child) && styleOf(child).display !== 'none',
  );
}

/** The overlays directly inside a node, each a tree of its own. */
function overlaysOf(node: Node): Node[] {
  if (node.type === 'Text') {
    return [];
  }
  return (node.children ?? []).filter((child): child is Node => typeof child !== 'string' && overlay(child));
}

/** A control's drawn height, where its style fixes one. */
function fixedHeight(node: Node): number {
  const style = styleOf(node);
  return Math.max(num(style.height), num(style.minHeight));
}

function direction(style: Record<string, unknown>): 'row' | 'column' {
  return style.flexDirection === 'row' || style.flexDirection === 'row-reverse' ? 'row' : 'column';
}

type Overlap = string;

const nameOf = (node: Node, fallback: string) =>
  String(node.props.testID ?? node.props.accessibilityLabel ?? fallback);

/**
 * Two stars of one person's rating: the one exception, kept from 0.4.0 part 6.
 * Each star is 38 wide with 5 either side, so five fit beside a name; a tap in
 * the 10 dp two neighbours share goes to the star drawn later. Five stars 48
 * apart do not fit a cover-screen row (see the 0.4.1 release record).
 */
function oneRating(left: Node, right: Node): boolean {
  const star = /^(.*)-star-[1-5]$/;
  const a = star.exec(String(left.props.testID ?? ''));
  const b = star.exec(String(right.props.testID ?? ''));
  return a !== null && b !== null && a[1] === b[1];
}

/** How far touch areas reach past this node's edges, noting every overlap inside it. */
function reachOf(node: Node, found: Overlap[], path: string): Reach {
  const style = styleOf(node);
  overlaysOf(node).forEach((child, index) => reachOf(child, found, `${path}/${nameOf(child, `overlay ${index}`)}`));
  if (isControl(node)) {
    return slopOf(node.props.hitSlop);
  }
  const children = placed(node);
  if (children.length === 0) {
    return NO_REACH;
  }
  const reaches = children.map((child, index) => {
    const own = reachOf(child, found, `${path}/${nameOf(child, String(index))}`);
    const childStyle = styleOf(child);
    const out = { ...own };
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      out[side] = own[side] - inset(childStyle, 'margin', side);
    }
    return out;
  });
  const dir = direction(style);
  const wraps = style.flexWrap === 'wrap';
  // Centred across a line beside something taller, a control's hit area
  // reaches only as far past the line as it reaches past its taller neighbour.
  if (!wraps && style.alignItems === 'center') {
    const tallest = Math.max(...children.map(fixedHeight));
    const [a, b]: [Side, Side] = dir === 'row' ? ['top', 'bottom'] : ['left', 'right'];
    children.forEach((child, index) => {
      const short = dir === 'row' ? (tallest - fixedHeight(child)) / 2 : 0;
      reaches[index]![a] -= short;
      reaches[index]![b] -= short;
    });
  }
  const rowGap = num(style.rowGap ?? style.gap);
  const columnGap = num(style.columnGap ?? style.gap);
  const mainGap = dir === 'row' ? columnGap : rowGap;
  const [before, after]: [Side, Side] = dir === 'row' ? ['left', 'right'] : ['top', 'bottom'];
  const [crossBefore, crossAfter]: [Side, Side] = dir === 'row' ? ['top', 'bottom'] : ['left', 'right'];
  const crossGap = dir === 'row' ? rowGap : columnGap;

  const where = `${path} (${dir}${wraps ? ', wrapping' : ''})`;
  for (let index = 1; index < reaches.length; index += 1) {
    if (oneRating(children[index - 1]!, children[index]!)) {
      continue;
    }
    const sum = reaches[index - 1]![after] + reaches[index]![before];
    if (Number.isFinite(sum) && sum > mainGap) {
      found.push(`${where}: ${nameOf(children[index - 1]!, String(index - 1))} and ${nameOf(children[index]!, String(index))} reach ${sum} into a gap of ${mainGap}`);
    }
  }
  if (wraps && reaches.length > 1) {
    const down = Math.max(...reaches.map((reach) => reach[crossAfter]));
    const up = Math.max(...reaches.map((reach) => reach[crossBefore]));
    if (Number.isFinite(down + up) && down + up > crossGap) {
      found.push(`${where}: two wrapped rows reach ${down + up} into a row gap of ${crossGap}`);
    }
  }

  // A scroll view pads its content through `contentContainerStyle`.
  const box =
    node.props.contentContainerStyle === undefined
      ? style
      : { ...style, ...(StyleSheet.flatten(node.props.contentContainerStyle as never) as Record<string, unknown>) };
  const edge = (side: Side, pick: 'first' | 'last' | 'any') => {
    const from =
      pick === 'any' ? Math.max(...reaches.map((reach) => reach[side])) : reaches[pick === 'first' ? 0 : reaches.length - 1]![side];
    return from - inset(box, 'padding', side) - border(box, side);
  };
  const result = { ...NO_REACH };
  result[before] = edge(before, wraps ? 'any' : 'first');
  result[after] = edge(after, wraps ? 'any' : 'last');
  result[crossBefore] = edge(crossBefore, 'any');
  result[crossAfter] = edge(crossAfter, 'any');
  return result;
}

export function overlapsIn(root: Node | Node[] | null): Overlap[] {
  const found: Overlap[] = [];
  for (const node of Array.isArray(root) ? root : root === null ? [] : [root]) {
    reachOf(node, found, nameOf(node, 'root'));
  }
  return [...new Set(found)];
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

type More = { readonly press?: string; readonly longPress?: string; readonly shows: string };

async function draw(name: PreviewScreenName, figures: Figures, more: readonly More[] = []): Promise<Overlap[]> {
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
  return overlapsIn(screen.toJSON() as Node | Node[] | null);
}

const view = (type: string, style: object, children: (Node | string)[] = [], props: object = {}): Node => ({
  type,
  props: { style, ...props },
  children,
});
const chip = (id: string) => view('View', { minHeight: 32 }, [], { testID: id, onClick: () => {}, hitSlop: { top: 8, bottom: 8 } });

describe('the overlap rule', () => {
  it('flags two rows of wrapped chips 8 apart, and passes them 16 apart', () => {
    const row = (rowGap: number) => view('View', { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap }, [chip('a'), chip('b'), chip('c')]);
    expect(overlapsIn(row(space.xs))).toHaveLength(1);
    expect(overlapsIn(row(space.md))).toEqual([]);
  });

  it('flags two chips stacked closer than their hit areas, through padding and margins', () => {
    const stacked = (gap: number, padding: number) =>
      view('View', { gap }, [view('View', { paddingBottom: padding }, [chip('a')]), chip('b')]);
    expect(overlapsIn(stacked(8, 0))).toHaveLength(1);
    expect(overlapsIn(stacked(8, 8))).toEqual([]);
    expect(overlapsIn(stacked(16, 0))).toEqual([]);
  });

  it('never flags a control beside words, or one control alone', () => {
    expect(overlapsIn(view('View', { gap: 0 }, [chip('a'), view('Text', {}, ['words'])]))).toEqual([]);
    expect(overlapsIn(view('View', { flexDirection: 'row', flexWrap: 'wrap', rowGap: 0 }, [chip('a')]))).toEqual([]);
  });
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
  ['a guest’s name on the review', 'review', [{ press: 'who-ate-it-someone-else', shows: 'who-ate-it-guest-name' }]],
];

describe.each([
  ['the cover display', COVER],
  ['the inner display', INNER],
] as const)('touch areas on %s', (_where, figures) => {
  it.each(PREVIEW_SCREENS)('%s: no two overlap', async (name) => {
    expect(await draw(name, figures)).toEqual([]);
  });

  it.each(FURTHER)('%s: no two overlap', async (_what, name, more) => {
    expect(await draw(name, figures, more)).toEqual([]);
  });
});

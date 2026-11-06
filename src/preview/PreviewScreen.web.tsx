/**
 * Each `?screen=` of the web preview, as the real screen and the taps that
 * bring it to the state the design pack shows (0.4.0, part 7). Web only.
 *
 * A screen is opened with its own component, exactly as its route opens it,
 * on the preview notebook. Sheets and states that a person reaches by tapping
 * (Filters, Add a reading, a note's options, No matches, Undo) are reached the
 * same way: by a short list of steps, pressing and typing on the screen's own
 * controls by their test ids. The browser runs the steps on the page; the Jest
 * suite runs the same steps with the testing library. No screen has a special
 * way in for the preview.
 */

import { useEffect, useRef } from 'react';

import { HomeScreen } from '../screens/HomeScreen';
import { CookScreen } from '../screens/CookScreen';
import { HouseholdScreen } from '../screens/HouseholdScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { usePendingDeletion } from '../state/PendingDeletion';
import type { PreviewScreenName } from './options.web';
import { PREVIEW_IDS, PREVIEW_NO_MATCH_WORDS, PREVIEW_TIMERS } from './seed.web';

export type PreviewStep =
  | { readonly kind: 'press'; readonly testID: string }
  | { readonly kind: 'type'; readonly testID: string; readonly text: string }
  /** Delete a cook as Home's own Delete does, so its Undo bar shows. */
  | { readonly kind: 'deleteCook'; readonly cookId: string };

export type PreviewView =
  | { readonly kind: 'home' }
  | { readonly kind: 'cook'; readonly cookId: string }
  | { readonly kind: 'review'; readonly cookId: string }
  | { readonly kind: 'household' };

export type PreviewPlan = {
  readonly view: PreviewView;
  /** A test id that is on screen once the screen has loaded. */
  readonly ready: string;
  readonly steps: readonly PreviewStep[];
  /** A test id that is on screen once the steps have done their work. */
  readonly shows: string;
  /**
   * Tabletop mode (0.5.0): the screen half folded. In the browser the
   * timers module's stub reports it for these screens; in Jest the test sets
   * the module's mock.
   */
  readonly tabletop?: true;
};

const HOME: PreviewView = { kind: 'home' };
const AGAIN: PreviewView = { kind: 'cook', cookId: PREVIEW_IDS.again };

export const PREVIEW_PLANS: Readonly<Record<PreviewScreenName, PreviewPlan>> = {
  home: { view: HOME, ready: 'cooking-now', steps: [], shows: 'history-list' },
  filters: {
    view: HOME,
    ready: 'search-filters',
    steps: [{ kind: 'press', testID: 'search-filters' }],
    shows: 'filters',
  },
  empty: { view: HOME, ready: 'home-empty', steps: [], shows: 'home-empty' },
  cook: { view: AGAIN, ready: 'cook-screen', steps: [], shows: 'next-time-card' },
  'add-reading': {
    view: AGAIN,
    ready: 'internal-reading-toggle',
    steps: [{ kind: 'press', testID: 'internal-reading-toggle' }],
    shows: 'temperature-save',
  },
  review: { view: { kind: 'review', cookId: PREVIEW_IDS.again }, ready: 'finish-review', steps: [], shows: 'verdict-input' },
  reviewed: {
    view: { kind: 'cook', cookId: PREVIEW_IDS.reviewed },
    ready: 'cook-detail-screen',
    steps: [],
    shows: 'ratings-card',
  },
  'whos-eating': { view: { kind: 'household' }, ready: 'household-screen', steps: [], shows: 'household-screen' },
  'no-matches': {
    view: HOME,
    ready: 'history-search',
    steps: [{ kind: 'type', testID: 'history-search', text: PREVIEW_NO_MATCH_WORDS }],
    shows: 'home-no-matches',
  },
  undo: {
    view: HOME,
    ready: 'history-list',
    steps: [{ kind: 'deleteCook', cookId: PREVIEW_IDS.deleted }],
    shows: 'undo-delete',
  },
  'note-options': {
    view: AGAIN,
    ready: `note-${PREVIEW_IDS.editedNote}-more`,
    steps: [{ kind: 'press', testID: `note-${PREVIEW_IDS.editedNote}-more` }],
    shows: `note-${PREVIEW_IDS.editedNote}-menu`,
  },
  // Three timers running above the composer: Rest, which had run out, is
  // stopped by tapping it, as a person would.
  timers: {
    view: AGAIN,
    ready: `timer-${PREVIEW_TIMERS.rest}`,
    steps: [{ kind: 'press', testID: `timer-${PREVIEW_TIMERS.rest}` }],
    shows: 'timer-dock',
  },
  'timer-sheet': {
    view: AGAIN,
    ready: 'timer-toggle',
    steps: [
      { kind: 'press', testID: 'timer-toggle' },
      { kind: 'press', testID: 'timer-name-rest' },
    ],
    shows: 'timer-start',
  },
  // Rest has run out: solid blue, Done.
  'timer-done': { view: AGAIN, ready: 'timer-dock', steps: [], shows: `timer-${PREVIEW_TIMERS.rest}` },
  tabletop: {
    view: AGAIN,
    ready: 'tabletop-stop',
    steps: [{ kind: 'press', testID: 'tabletop-stop' }],
    shows: 'tabletop-timer',
    tabletop: true,
  },
  'tabletop-done': { view: AGAIN, ready: 'tabletop-stop', steps: [], shows: 'tabletop-bottom', tabletop: true },
};

/** Where a screen's own links go: the app's routes, with the theme and font scale kept. */
export type PreviewNavigation = (path: string) => void;

/** The screen a plan opens, wired as its route wires it. */
export function PreviewScreenView({ view, go }: { view: PreviewView; go: PreviewNavigation }) {
  const home = () => go('/');
  const openCook = (cookId: string) => go(`/cook/${cookId}`);
  const review = (cookId: string) => go(`/cook/${cookId}/review`);
  switch (view.kind) {
    case 'home':
      return <HomeScreen onOpenCook={openCook} onReview={review} onHousehold={() => go('/household')} />;
    case 'cook':
      return <CookScreen cookId={view.cookId} onBack={home} onReview={review} onOpenCook={openCook} />;
    case 'review':
      return <ReviewScreen cookId={view.cookId} onBack={() => openCook(view.cookId)} onFinished={openCook} />;
    case 'household':
      return <HouseholdScreen onBack={home} />;
  }
}

/** Presses and typing, done on the page in the browser or by the testing library in Jest. */
export type PreviewPerformer = (step: Exclude<PreviewStep, { kind: 'deleteCook' }>) => Promise<void>;

/**
 * Runs a plan's steps once, in order, after the screen is up. Draws nothing.
 * Deleting a cook goes through the app's own pending deletion, as Home's
 * Delete does, so the Undo bar is the app's own.
 */
export function PreviewSteps({
  steps,
  perform,
  onDone,
}: {
  steps: readonly PreviewStep[];
  perform: PreviewPerformer;
  onDone?: (problem: string | null) => void;
}) {
  const pending = usePendingDeletion();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) {
      return;
    }
    ran.current = true;
    (async () => {
      for (const step of steps) {
        if (step.kind === 'deleteCook') {
          const problem = await pending.requestDelete(step.cookId);
          if (problem !== null) {
            throw new Error(problem);
          }
        } else {
          await perform(step);
        }
      }
    })().then(
      () => onDone?.(null),
      (cause: unknown) => onDone?.(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [steps, perform, onDone, pending]);
  return null;
}

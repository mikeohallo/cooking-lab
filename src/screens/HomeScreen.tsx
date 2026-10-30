import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { usePendingDeletion } from '../state/PendingDeletion';
import { useStorage } from '../state/StorageProvider';
import { useCookList } from '../state/useCookList';
import { useExport } from '../state/useExport';
import { useHistoryIndex } from '../state/useHistoryIndex';
import { useTagIndex } from '../state/useTagIndex';
import { useWrite } from '../state/useWrite';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { Card } from '../components/Card';
import { CoreLoop } from '../components/CoreLoop';
import { ScreenContainer } from '../components/ScreenContainer';
import { ShellHeader } from '../components/ShellHeader';
import { StateNotice } from '../components/StateNotice';
import {
  COOKING_NOW,
  EMPTY_HOME_BODY,
  EMPTY_HOME_TITLE,
  EXPORT_EVERYTHING,
  EXPORT_EVERYTHING_HINT,
  FILTER_NO_RESULTS_BODY,
  FILTER_NO_RESULTS_TITLE,
  HOME_MORE,
  NEW_COOK_HINT,
  NEW_COOK_TITLE,
  PAGE_NEXT,
  PAGE_PREVIOUS,
  PRODUCT_TAGLINE,
  SEARCH_GROUP_ALL,
  SEARCH_GROUP_SOME,
  SEARCH_NO_RESULTS_BODY,
  SEARCH_NO_RESULTS_TITLE,
  UNSAVED_KEPT,
  WHOS_EATING,
  WHOS_EATING_HINT,
} from '../content/product';
import type { Cook, CookId } from '../domain/entities';
import type { StoredMealType } from '../domain/enums';
import { RevealOnChange } from '../layout/RevealOnChange';
import { MIN_TOUCH_TARGET, colors, radius, space } from '../theme/tokens';
import { CookActions } from './CookActions';
import { ExportNotice } from './ExportNotice';
import { applyFilters, filtersActive, type CookFilters } from './history/filters';
import { searchCooks, searchable, type SearchHit } from './history/search';
import { CookCard } from './home/CookCard';
import { pageOf, pagePosition, pageSummary } from './home/paging';
import { starredRatings } from './home/ratingsLine';
import { SearchPanel } from './home/SearchPanel';

type HomeScreenProps = {
  onOpenCook: (cookId: CookId) => void;
  /** Opens "Who's eating" (0.3.0). */
  onHousehold?: () => void;
  /** Bumped by the route when the screen regains focus, to reload. */
  refreshToken?: number;
};

/** One card in the reviewed list: a cook, and how it matched when searching. */
type Entry = {
  readonly cook: Cook;
  readonly hit?: SearchHit;
  readonly group?: 'all' | 'some';
};

/**
 * Home, which is also History (0.3.0).
 *
 * Top to bottom: the title with its ⋯ menu (Export everything, Who's eating);
 * New Cook, one tap, as always; *Cooking now*, the open cooks, hidden when
 * there are none; the search box with the meal-type chips, Who & stars and
 * *Show me my tags* under it; then every reviewed cook, newest first, ten to a
 * page.
 *
 * Search and filters work on the reviewed cooks and page the same way,
 * starting at page 1 each time they change. The page and the scroll position
 * live in this screen, which stays mounted under a cook's page, so opening a
 * cook and coming back finds the same page where it was left.
 */
export function HomeScreen({ onOpenCook, onHousehold = () => {}, refreshToken = 0 }: HomeScreenProps) {
  const { data, exporter, newId, now } = useStorage();
  // A cook deleted, or brought back with Undo, changes the lists too.
  const { version } = usePendingDeletion();
  const reload = refreshToken + version;
  const open = useCookList({ status: 'open', sort: 'newest_first' }, reload);
  const reviewed = useCookList({ status: 'reviewed', sort: 'newest_first' }, reload);
  const cooks = reviewed.status === 'ready' ? reviewed.cooks : EMPTY_COOKS;
  const ids = cooks.map((cook) => cook.id);
  const tagIndex = useTagIndex(ids, reload);
  const index = useHistoryIndex(ids, reload);

  const [typed, setTyped] = useState('');
  const [pickedTags, setPickedTags] = useState<readonly string[]>([]);
  const [mealFilter, setMealFilter] = useState<readonly StoredMealType[]>([]);
  const [who, setWho] = useState<CookFilters['who']>(null);
  const [page, setPage] = useState(1);
  const [pageMoves, setPageMoves] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<Cook | null>(null);
  const create = useWrite();
  const exportAll = useExport();

  // A new search or filter starts again at page 1.
  const queryKey = JSON.stringify([typed, pickedTags, mealFilter, who]);
  const [pagedFor, setPagedFor] = useState(queryKey);
  if (pagedFor !== queryKey) {
    setPagedFor(queryKey);
    setPage(1);
  }

  const mealTypes = reviewed.status === 'ready' ? reviewed.mealTypes : EMPTY_MEALS;
  const verdicts = reviewed.status === 'ready' ? reviewed.verdicts : EMPTY_VERDICTS;
  const filters: CookFilters = { mealTypes: mealFilter, who };
  const filtering = filtersActive(filters);
  const shown = applyFilters(cooks, { mealTypes, ratingsByCook: index.ratingsByCook }, filters);
  const results = searchCooks(searchable(shown, tagIndex.byCook, index.ingredientsByCook), {
    typed,
    pickedTags,
  });
  const searching = results.terms.length > 0;
  const entries: readonly Entry[] = searching
    ? [
        ...results.all.map((hit) => ({ cook: hit.cook, hit, group: 'all' as const })),
        ...results.some.map((hit) => ({ cook: hit.cook, hit, group: 'some' as const })),
      ]
    : shown.map((cook) => ({ cook }));
  const current = pageOf(entries, page);

  const startCook = async () => {
    const result = await create.run(() =>
      data.capture.startCook({ id: newId(), startedAt: now() }, 'user', now()),
    );
    if (result.ok) {
      onOpenCook(result.record.id);
    }
  };

  const goToPage = (next: number) => {
    setPage(next);
    setPageMoves((moves) => moves + 1);
  };

  const loaded = open.status === 'ready' && reviewed.status === 'ready';
  const isEmpty = loaded && open.cooks.length === 0 && reviewed.cooks.length === 0;
  const loadProblem =
    open.status === 'failed' ? open.message : reviewed.status === 'failed' ? reviewed.message : null;

  const card = (entry: Entry) => (
    <CookCard
      key={entry.cook.id}
      cook={entry.cook}
      hit={entry.hit}
      verdict={verdicts[entry.cook.id] ?? entry.cook.verdict}
      mealType={mealTypes[entry.cook.id] ?? null}
      ratings={starredRatings(index.ratingsByCook.get(entry.cook.id) ?? [], index.household)}
      onPress={() => onOpenCook(entry.cook.id)}
      onLongPress={() => setActionsFor(entry.cook)}
    />
  );

  const more = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={HOME_MORE}
      accessibilityState={{ expanded: menuOpen }}
      onPress={() => setMenuOpen((now) => !now)}
      style={({ pressed }) => [styles.more, pressed && styles.morePressed]}
      testID="home-more"
    >
      <AppText variant="sectionTitle" tone="primary" importantForAccessibility="no">
        ⋯
      </AppText>
    </Pressable>
  );

  return (
    <ScreenContainer testID="home-screen">
      <ShellHeader subtitle={isEmpty ? PRODUCT_TAGLINE : undefined} trailing={more} />

      {menuOpen ? (
        <Card testID="home-menu">
          {loaded && !isEmpty ? (
            <View style={styles.menuItem} testID="export-section">
              <ActionButton
                label={EXPORT_EVERYTHING}
                onPress={() => void exportAll.run(() => exporter.exportEverything())}
                variant="quiet"
                pending={exportAll.state.status === 'pending'}
                style={styles.menuButton}
                testID="export-everything"
              />
              <AppText variant="caption" tone="muted">
                {EXPORT_EVERYTHING_HINT}
              </AppText>
              <ExportNotice state={exportAll.state} testID="export-everything" />
            </View>
          ) : null}
          <ActionButton
            label={WHOS_EATING}
            accessibilityHint={WHOS_EATING_HINT}
            onPress={() => {
              setMenuOpen(false);
              onHousehold();
            }}
            variant="quiet"
            style={styles.menuButton}
            testID="whos-eating"
          />
        </Card>
      ) : null}

      <ActionButton
        label={NEW_COOK_TITLE}
        hint={NEW_COOK_HINT}
        onPress={() => void startCook()}
        variant="primary"
        size="hero"
        pending={create.state.status === 'pending'}
        style={styles.newCook}
        testID="new-cook"
      />
      {create.state.status === 'failed' ? (
        <StateNotice
          title={create.state.message}
          body="Nothing was created. Try again in a moment."
          tone="problem"
          testID="new-cook-failed"
        />
      ) : null}

      {loadProblem ? (
        <StateNotice
          title="Your cooks could not be listed"
          body={`${loadProblem} ${UNSAVED_KEPT}`}
          tone="problem"
        />
      ) : null}

      {isEmpty ? (
        <View style={styles.section}>
          <StateNotice title={EMPTY_HOME_TITLE} body={EMPTY_HOME_BODY} testID="home-empty" />
          <CoreLoop />
        </View>
      ) : null}

      {open.status === 'ready' && open.cooks.length > 0 ? (
        <View style={styles.section} testID="cooking-now">
          <AppText variant="sectionTitle" accessibilityRole="header">
            {COOKING_NOW}
          </AppText>
          {open.cooks.map((cook) => (
            <CookCard
              key={cook.id}
              cook={cook}
              verdict={open.verdicts[cook.id] ?? cook.verdict}
              mealType={open.mealTypes[cook.id] ?? null}
              onPress={() => onOpenCook(cook.id)}
              onLongPress={() => setActionsFor(cook)}
            />
          ))}
        </View>
      ) : null}

      {reviewed.status === 'ready' && cooks.length > 0 ? (
        <>
          <RevealOnChange token={pageMoves} style={styles.section} testID="home-search-block">
            <SearchPanel
              typed={typed}
              onType={setTyped}
              pickedTags={pickedTags}
              onPickTags={setPickedTags}
              mealFilter={mealFilter}
              onMealFilter={setMealFilter}
              who={who}
              onWho={setWho}
              allTags={tagIndex.allTags}
              household={index.household}
              guestNames={index.guestNames}
            />
          </RevealOnChange>

          {!searching && filtering && shown.length === 0 ? (
            <StateNotice
              title={FILTER_NO_RESULTS_TITLE}
              body={FILTER_NO_RESULTS_BODY}
              testID="history-filter-empty"
            />
          ) : null}
          {searching && entries.length === 0 ? (
            <StateNotice
              title={SEARCH_NO_RESULTS_TITLE}
              body={SEARCH_NO_RESULTS_BODY}
              testID="history-search-empty"
            />
          ) : null}

          {entries.length > 0 ? (
            <View style={styles.list}>
              <AppText variant="label" tone="muted" testID="home-page-summary">
                {pageSummary(current)}
              </AppText>
              {searching ? (
                <View style={styles.list} testID="history-results">
                  <PageGroup
                    label={SEARCH_GROUP_ALL}
                    entries={current.items.filter((entry) => entry.group === 'all')}
                    render={card}
                    testID="history-group-all"
                  />
                  <PageGroup
                    label={SEARCH_GROUP_SOME}
                    entries={current.items.filter((entry) => entry.group === 'some')}
                    render={card}
                    testID="history-group-some"
                  />
                </View>
              ) : (
                <View style={styles.list} testID="history-list">
                  {current.items.map(card)}
                </View>
              )}
              {current.pageCount > 1 ? (
                <View style={styles.pager} testID="home-pager">
                  <ActionButton
                    label={PAGE_PREVIOUS}
                    variant="secondary"
                    disabled={current.page <= 1}
                    onPress={() => goToPage(current.page - 1)}
                    style={styles.pagerButton}
                    testID="home-page-previous"
                  />
                  <AppText
                    variant="bodyStrong"
                    style={styles.pagerPosition}
                    accessibilityLabel={`Page ${pagePosition(current)}`}
                    testID="home-page-position"
                  >
                    {pagePosition(current)}
                  </AppText>
                  <ActionButton
                    label={PAGE_NEXT}
                    variant="secondary"
                    disabled={current.page >= current.pageCount}
                    onPress={() => goToPage(current.page + 1)}
                    style={styles.pagerButton}
                    testID="home-page-next"
                  />
                </View>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}

      <CookActions cook={actionsFor} onClose={() => setActionsFor(null)} />
    </ScreenContainer>
  );
}

type PageGroupProps = {
  label: string;
  entries: readonly Entry[];
  render: (entry: Entry) => ReactElement;
  testID: string;
};

/** One of the two result groups on this page. An empty group is not drawn. */
function PageGroup({ label, entries, render, testID }: PageGroupProps) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <View style={styles.list} testID={testID}>
      <AppText variant="sectionTitle" accessibilityRole="header">
        {label}
      </AppText>
      {entries.map(render)}
    </View>
  );
}

/** Stable empties while the lists load, so the hooks below do not loop. */
const EMPTY_COOKS: readonly Cook[] = [];
const EMPTY_MEALS: Readonly<Record<CookId, StoredMealType>> = {};
const EMPTY_VERDICTS: Readonly<Record<CookId, string | null>> = {};

const styles = StyleSheet.create({
  section: {
    gap: space.xs,
    marginTop: space.lg,
  },
  newCook: {
    marginTop: space.xs,
  },
  list: {
    gap: space.xs,
    marginTop: space.xs,
  },
  more: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  morePressed: {
    backgroundColor: colors.surfaceMuted,
  },
  menuItem: {
    gap: space.xxs,
  },
  menuButton: {
    alignSelf: 'flex-start',
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
    marginTop: space.sm,
    marginBottom: space.lg,
  },
  pagerButton: {
    minWidth: 104,
  },
  pagerPosition: {
    flex: 1,
    textAlign: 'center',
  },
});

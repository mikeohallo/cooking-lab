import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { UndoSlot, usePendingDeletion } from '../state/PendingDeletion';
import { useStorage } from '../state/StorageProvider';
import { useCardPhotoUris } from '../state/useCardPhotos';
import { useCookList } from '../state/useCookList';
import { useExport } from '../state/useExport';
import { useHistoryIndex } from '../state/useHistoryIndex';
import { useNoteCounts } from '../state/useNoteCounts';
import { useTagIndex } from '../state/useTagIndex';
import { useWrite } from '../state/useWrite';
import { Button } from '../components/Button';
import { AppText } from '../components/AppText';
import { Card } from '../components/Card';
import { CoreLoop } from '../components/CoreLoop';
import { FilterChip } from '../components/FilterChip';
import { MEAL_ICON } from '../components/Icon';
import { NewCookButton } from '../components/NewCookButton';
import { Pager } from '../components/Pager';
import { SearchBar } from '../components/SearchBar';
import { IconButton } from '../components/TopBar';
import { ScreenContainer } from '../components/ScreenContainer';
import { ShellHeader } from '../components/ShellHeader';
import { Notice } from '../components/Notice';
import {
  CLEAR_FILTERS,
  EMPTY_HOME_BODY,
  EMPTY_HOME_TITLE,
  EXPORT_EVERYTHING,
  EXPORT_EVERYTHING_HINT,
  FILTERS,
  FILTER_ALL,
  FILTER_MEAL_TYPE,
  HOME_MORE,
  NEW_COOK_HINT,
  NEW_COOK_TITLE,
  NO_COOK_CHOSEN_BODY,
  NO_COOK_CHOSEN_TITLE,
  NO_MATCHES_BODY,
  NO_MATCHES_TITLE,
  PAGE_NEXT,
  PAGE_PREVIOUS,
  SEARCH_GROUP_ALL,
  SEARCH_GROUP_SOME,
  SEARCH_PLACEHOLDER,
  UNSAVED_KEPT,
  WHOS_EATING,
  WHOS_EATING_HINT,
  YOUR_COOKS,
  matchCount,
  reviewedCount,
} from '../content/product';
import { getBuildStamp, versionLine } from '../config/appIdentity';
import { MEAL_TYPE_LABELS, cuisineLabel, timesCooked } from '../domain/cookRecord';
import type { Cook, CookCuisine, CookId } from '../domain/entities';
import { STORED_MEAL_TYPES, type StoredMealType } from '../domain/enums';
import { RevealOnChange } from '../layout/RevealOnChange';
import { HOME_LIST_PANE_WIDTH } from '../layout/responsive';
import { useLayoutMetrics } from '../layout/useLayoutMetrics';
import { makeStyles } from '../theme/theme';
import { mealColorRole, space } from '../theme/tokens';
import { CookActions } from './CookActions';
import { CookScreen } from './CookScreen';
import { ExportNotice } from './ExportNotice';
import { applyFilters, cuisineOptions, peopleToPick, type FilterInputs } from './history/filters';
import { searchCooks, searchable, type SearchHit } from './history/search';
import { CookCard } from './home/CookCard';
import { CookingNowCard } from './home/CookingNowCard';
import { FiltersSheet, NO_SHEET_FILTERS, sheetFilterCount, type SheetFilters } from './home/FiltersSheet';
import { pageOf, pagePosition } from './home/paging';
import { starredRatings } from './home/ratingsLine';

type HomeScreenProps = {
  onOpenCook: (cookId: CookId) => void;
  /** Opens a reviewed cook's Edit review (0.4.0, part 5): Edit review in the right-hand pane. */
  onReview?: (cookId: CookId) => void;
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

type Query = {
  readonly typed: string;
  readonly meal: StoredMealType | null;
  readonly sheet: SheetFilters;
};

type Indexes = {
  readonly inputs: FilterInputs;
  readonly tagsByCook: Parameters<typeof searchable>[1];
  readonly ingredientsByCook: ReadonlyMap<CookId, string>;
  readonly cuisineWordsByCook: ReadonlyMap<CookId, string>;
};

/** The reviewed cooks a query shows, in order, grouped when it is a search. */
export function entriesFor(
  cooks: readonly Cook[],
  indexes: Indexes,
  query: Query,
): { readonly entries: readonly Entry[]; readonly searching: boolean } {
  const shown = applyFilters(cooks, indexes.inputs, {
    mealTypes: query.meal === null ? [] : [query.meal],
    who: query.sheet.who,
    cuisines: query.sheet.cuisines,
  });
  const results = searchCooks(
    searchable(shown, indexes.tagsByCook, indexes.ingredientsByCook, indexes.cuisineWordsByCook),
    { typed: query.typed, pickedTags: query.sheet.tags },
  );
  const searching = results.terms.length > 0;
  return {
    searching,
    entries: searching
      ? [
          ...results.all.map((hit) => ({ cook: hit.cook, hit, group: 'all' as const })),
          ...results.some.map((hit) => ({ cook: hit.cook, hit, group: 'some' as const })),
        ]
      : shown.map((cook) => ({ cook })),
  };
}

/**
 * Home, which is also History (0.4.0, part 2).
 *
 * Top to bottom: "Cooking Lab" and its round ⋯ (Export everything, Who's
 * eating, the version line); a Cooking now card for each open cook; Your
 * cooks with how many are reviewed, the search bar and its round filter
 * button, and the meal chips in one scrolling row; then the reviewed cooks,
 * newest first, ten to a page. New Cook floats above the foot of the screen,
 * always in reach, with the list scrolling under it, and the Undo bar after a
 * delete sits just above it.
 *
 * The filter button opens the Filters sheet (who and stars, cuisine, tags).
 * Search and filters start again at page 1 each time they change. The page
 * and the scroll position live in this screen, which stays mounted under a
 * cook's page, so coming back finds the same page where it was left.
 *
 * On the inner display (0.4.0, part 3), upright or sideways, all of that is
 * the left-hand pane (45% of the window, 320 to 400), with the meal chips
 * wrapped and New Cook docked at its foot. The right-hand pane is the chosen cook's
 * page, as on the cover screen, with Cook this again and Edit review pinned
 * at its foot; the chosen card has the teal edge. With nothing chosen it is
 * the most recent cook, or a quiet notice when there is none. An open cook
 * still opens on its own page, full screen.
 */
export function HomeScreen({
  onOpenCook,
  onReview = onOpenCook,
  onHousehold = () => {},
  refreshToken = 0,
}: HomeScreenProps) {
  const styles = useStyles();
  const window = useWindowDimensions();
  const { data, exporter, newId, now } = useStorage();
  // A cook deleted, or brought back with Undo, changes the lists too.
  const { version, pendingNote } = usePendingDeletion();
  const reload = refreshToken + version;
  const open = useCookList({ status: 'open', sort: 'newest_first' }, reload);
  const reviewed = useCookList({ status: 'reviewed', sort: 'newest_first' }, reload);
  const cooks = reviewed.status === 'ready' ? reviewed.cooks : EMPTY_COOKS;
  const openCooks = open.status === 'ready' ? open.cooks : EMPTY_COOKS;
  const ids = cooks.map((cook) => cook.id);
  const openIds = openCooks.map((cook) => cook.id);
  const tagIndex = useTagIndex(ids, reload);
  const index = useHistoryIndex(ids, reload);
  const noteCounts = useNoteCounts(openIds, reload, pendingNote);

  const [typed, setTyped] = useState('');
  const [meal, setMeal] = useState<StoredMealType | null>(null);
  const [sheet, setSheet] = useState<SheetFilters>(NO_SHEET_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageMoves, setPageMoves] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<Cook | null>(null);
  const [selected, setSelected] = useState<CookId | null>(null);
  const { twoPane } = useLayoutMetrics();
  const create = useWrite();
  const exportAll = useExport();

  // A new search or filter starts again at page 1.
  const queryKey = JSON.stringify([typed, meal, sheet]);
  const [pagedFor, setPagedFor] = useState(queryKey);
  if (pagedFor !== queryKey) {
    setPagedFor(queryKey);
    setPage(1);
  }

  // Every cook we know of, open and reviewed, for "2nd time".
  const byId = useMemo(() => {
    const all = new Map<CookId, Cook>();
    for (const cook of [...openCooks, ...cooks]) {
      all.set(cook.id, cook);
    }
    return all;
  }, [openCooks, cooks]);
  const timesOf = (cook: Cook) => timesCooked(cook, (id) => byId.get(id) ?? null);

  const mealTypes: Readonly<Record<CookId, StoredMealType>> = {
    ...(open.status === 'ready' ? open.mealTypes : {}),
    ...(reviewed.status === 'ready' ? reviewed.mealTypes : {}),
  };
  const cuisineRows: Readonly<Record<CookId, CookCuisine>> = {
    ...(open.status === 'ready' ? open.cuisines : {}),
    ...(reviewed.status === 'ready' ? reviewed.cuisines : {}),
  };
  const indexes: Indexes = {
    inputs: { mealTypes, ratingsByCook: index.ratingsByCook, cuisines: index.cuisines },
    tagsByCook: tagIndex.byCook,
    ingredientsByCook: index.ingredientsByCook,
    cuisineWordsByCook: index.cuisineWordsByCook,
  };
  const { entries, searching } = entriesFor(cooks, indexes, { typed, meal, sheet });
  const narrowed = searching || meal !== null || sheetFilterCount(sheet) > 0;
  const current = pageOf(entries, page);
  const photoUris = useCardPhotoUris([...openIds, ...current.items.map((entry) => entry.cook.id)], reload);
  // The cook in the right-hand pane: the one tapped, for as long as it is
  // still a reviewed cook (on any page, through any search), or else the most
  // recent. Kept on the cover display, so unfolding again shows the same one.
  const chosen: CookId | null = twoPane
    ? (cooks.find((cook) => cook.id === selected)?.id ?? cooks[0]?.id ?? null)
    : null;

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

  const clearAll = () => {
    setTyped('');
    setMeal(null);
    setSheet(NO_SHEET_FILTERS);
  };

  const loaded = open.status === 'ready' && reviewed.status === 'ready';
  const isEmpty = loaded && openCooks.length === 0 && cooks.length === 0;
  const loadProblem =
    open.status === 'failed' ? open.message : reviewed.status === 'failed' ? reviewed.message : null;

  const card = (entry: Entry) => (
    <CookCard
      key={entry.cook.id}
      cook={entry.cook}
      hit={entry.hit}
      mealType={mealTypes[entry.cook.id] ?? null}
      cuisine={cuisineLabel(cuisineRows[entry.cook.id] ?? null)}
      photoUri={photoUris.get(entry.cook.id) ?? null}
      ratings={starredRatings(index.ratingsByCook.get(entry.cook.id) ?? [], index.household)}
      timesCooked={timesOf(entry.cook)}
      selected={twoPane ? entry.cook.id === chosen : undefined}
      compact={twoPane}
      onPress={() => (twoPane ? setSelected(entry.cook.id) : onOpenCook(entry.cook.id))}
      onLongPress={() => setActionsFor(entry.cook)}
    />
  );

  const more = (
    <IconButton
      icon="more"
      accessibilityLabel={HOME_MORE}
      accessibilityState={{ expanded: menuOpen }}
      onPress={() => setMenuOpen((now) => !now)}
      testID="home-more"
    />
  );

  const floating = (
    <>
      <UndoSlot inline />
      <NewCookButton
        label={NEW_COOK_TITLE}
        accessibilityHint={NEW_COOK_HINT}
        onPress={() => void startCook()}
        pending={create.state.status === 'pending'}
        testID="new-cook"
      />
    </>
  );

  return (
    <ScreenContainer
      testID="home-screen"
      floating={floating}
      side={
        chosen !== null
          ? {
              testID: 'home-cook-pane',
              surface: true,
              fill: true,
              children: (
                <CookScreen
                  key={chosen}
                  cookId={chosen}
                  embedded
                  onBack={() => {}}
                  onReview={onReview}
                  onOpenCook={onOpenCook}
                  refreshToken={reload}
                />
              ),
            }
          : loaded
            ? {
                testID: 'home-cook-pane-empty',
                surface: true,
                children: (
                  <View style={styles.paneEmpty}>
                    <Notice title={NO_COOK_CHOSEN_TITLE} body={NO_COOK_CHOSEN_BODY} icon="book" />
                  </View>
                ),
              }
            : undefined
      }
      fixed={{ pane: 'main', width: HOME_LIST_PANE_WIDTH }}
    >
      <ShellHeader trailing={more} compact={twoPane} />

      {menuOpen ? (
        <Card testID="home-menu" style={styles.menu}>
          {loaded && !isEmpty ? (
            <View style={styles.menuItem} testID="export-section">
              <Button
                label={EXPORT_EVERYTHING}
                onPress={() => void exportAll.run(() => exporter.exportEverything())}
                variant="text"
                pending={exportAll.state.status === 'pending'}
                style={styles.menuButton}
                testID="export-everything"
              />
              <AppText variant="secondary" tone="inkMuted">
                {EXPORT_EVERYTHING_HINT}
              </AppText>
              <ExportNotice state={exportAll.state} testID="export-everything" />
            </View>
          ) : null}
          <Button
            label={WHOS_EATING}
            accessibilityHint={WHOS_EATING_HINT}
            onPress={() => {
              setMenuOpen(false);
              onHousehold();
            }}
            variant="text"
            style={styles.menuButton}
            testID="whos-eating"
          />
          <AppText variant="secondary" tone="inkMuted" testID="home-version">
            {versionLine(getBuildStamp(), window.width, window.height)}
          </AppText>
        </Card>
      ) : null}

      {create.state.status === 'failed' ? (
        <Notice
          title={create.state.message}
          body="Nothing was created. Try again in a moment."
          tone="problem"
          testID="new-cook-failed"
        />
      ) : null}

      {loadProblem ? (
        <Notice
          title="Your cooks could not be listed"
          body={`${loadProblem} ${UNSAVED_KEPT}`}
          tone="problem"
        />
      ) : null}

      {isEmpty ? (
        <View style={styles.empty}>
          <Notice title={EMPTY_HOME_TITLE} body={EMPTY_HOME_BODY} icon="book" testID="home-empty" />
          <CoreLoop />
        </View>
      ) : null}

      {openCooks.length > 0 ? (
        <View style={styles.cookingNow} testID="cooking-now">
          {openCooks.map((cook) => (
            <CookingNowCard
              key={cook.id}
              cook={cook}
              mealType={mealTypes[cook.id] ?? null}
              cuisine={cuisineLabel(cuisineRows[cook.id] ?? null)}
              photoUri={photoUris.get(cook.id) ?? null}
              notes={noteCounts.get(cook.id) ?? null}
              timesCooked={timesOf(cook)}
              onPress={() => onOpenCook(cook.id)}
              onLongPress={() => setActionsFor(cook)}
              compact={twoPane}
            />
          ))}
        </View>
      ) : null}

      {reviewed.status === 'ready' && cooks.length > 0 ? (
        <>
          <RevealOnChange token={pageMoves} style={styles.section} testID="home-search-block">
            <View style={styles.headingRow}>
              <AppText variant="heading" accessibilityRole="header" style={styles.heading}>
                {YOUR_COOKS}
              </AppText>
              <AppText variant="secondary" tone="inkMuted" testID="home-count">
                {narrowed ? matchCount(entries.length, cooks.length) : reviewedCount(cooks.length)}
              </AppText>
            </View>
            <SearchBar
              value={typed}
              onChangeText={setTyped}
              placeholder={SEARCH_PLACEHOLDER}
              accessibilityLabel={SEARCH_PLACEHOLDER}
              autoCapitalize="none"
              autoCorrect={false}
              onFilters={() => setSheetOpen(true)}
              filterCount={sheetFilterCount(sheet)}
              filtersLabel={FILTERS}
              testID="history-search"
            />
            <ChipRow wrap={twoPane}>
              <FilterChip
                label={FILTER_ALL}
                selected={meal === null}
                role="radio"
                onPress={() => setMeal(null)}
                testID="history-meal-all"
              />
              {STORED_MEAL_TYPES.map((mealType) => (
                <FilterChip
                  key={mealType}
                  label={MEAL_TYPE_LABELS[mealType]}
                  selected={meal === mealType}
                  role="radio"
                  icon={MEAL_ICON[mealType]}
                  iconColor={mealColorRole[mealType]}
                  onPress={() => setMeal(meal === mealType ? null : mealType)}
                  testID={`history-meal-${mealType}`}
                />
              ))}
            </ChipRow>
          </RevealOnChange>

          {narrowed && entries.length === 0 ? (
            <Notice
              title={NO_MATCHES_TITLE}
              body={NO_MATCHES_BODY}
              icon="search"
              action={{ label: CLEAR_FILTERS, onPress: clearAll }}
              testID="home-no-matches"
            />
          ) : null}

          {entries.length > 0 ? (
            <View style={styles.list}>
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
                <Pager
                  page={current.page}
                  pageCount={current.pageCount}
                  position={pagePosition(current)}
                  previousLabel={PAGE_PREVIOUS}
                  nextLabel={PAGE_NEXT}
                  onPrevious={() => goToPage(current.page - 1)}
                  onNext={() => goToPage(current.page + 1)}
                />
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}

      <FiltersSheet
        // A fresh draft each time it opens.
        key={sheetOpen ? 'open' : 'closed'}
        visible={sheetOpen}
        current={sheet}
        people={peopleToPick(index.household, index.guestNames)}
        cuisines={cuisineOptions(index.otherCuisineWords)}
        tags={tagIndex.allTags}
        countFor={(draft) => entriesFor(cooks, indexes, { typed, meal, sheet: draft }).entries.length}
        onApply={(draft) => {
          setSheet(draft);
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
      />

      <CookActions cook={actionsFor} onClose={() => setActionsFor(null)} />
    </ScreenContainer>
  );
}

/**
 * The meal chips: one row scrolling sideways on the cover screen; on the inner
 * display's list pane, wrapped onto two rows, as drawn.
 */
function ChipRow({ wrap, children }: { wrap: boolean; children: ReactNode }) {
  const styles = useStyles();
  if (wrap) {
    return (
      <View
        style={[styles.chips, styles.chipsWrapped]}
        accessibilityRole="radiogroup"
        accessibilityLabel={FILTER_MEAL_TYPE}
        testID="history-meal-filter"
      >
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.chipScroll}
      contentContainerStyle={styles.chips}
      accessibilityLabel={FILTER_MEAL_TYPE}
      testID="history-meal-filter"
    >
      {children}
    </ScrollView>
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
  const styles = useStyles();
  if (entries.length === 0) {
    return null;
  }
  return (
    <View style={styles.list} testID={testID}>
      <AppText variant="bodyStrong" tone="inkMuted" accessibilityRole="header">
        {label}
      </AppText>
      {entries.map(render)}
    </View>
  );
}

/** A stable empty while the lists load, so the hooks below do not loop. */
const EMPTY_COOKS: readonly Cook[] = [];

const useStyles = makeStyles(() =>
  StyleSheet.create({
    menu: {
      marginBottom: space.md,
    },
    empty: {
      gap: space.xs,
      marginTop: space.xxl,
      alignItems: 'center',
    },
    cookingNow: {
      gap: space.sm,
      marginBottom: space.lg,
    },
    section: {
      gap: space.sm,
    },
    headingRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: space.sm,
    },
    heading: {
      flexShrink: 1,
    },
    chipScroll: {
      flexGrow: 0,
    },
    chips: {
      gap: space.xs,
    },
    chipsWrapped: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    paneEmpty: {
      marginTop: space.xxl,
    },
    list: {
      gap: space.sm,
      marginTop: space.xs,
    },
    menuItem: {
      gap: space.xxs,
    },
    menuButton: {
      alignSelf: 'flex-start',
    },
  }),
);

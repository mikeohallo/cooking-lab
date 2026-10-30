import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { usePendingDeletion } from '../state/PendingDeletion';
import { useCookList } from '../state/useCookList';
import { useHistoryIndex } from '../state/useHistoryIndex';
import { useTagIndex } from '../state/useTagIndex';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { Card } from '../components/Card';
import { MealTypeLabel } from '../components/MealTypeLabel';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateNotice } from '../components/StateNotice';
import { StatusChip } from '../components/StatusChip';
import { TagChip } from '../components/TagChip';
import { TextField } from '../components/TextField';
import {
  CLEAR_FILTERS,
  CLEAR_SEARCH,
  DELETE_COOK,
  EMPTY_HISTORY_BODY,
  EMPTY_HISTORY_TITLE,
  EMPTY_OPEN_BODY,
  EMPTY_OPEN_TITLE,
  EMPTY_REVIEWED_BODY,
  EMPTY_REVIEWED_TITLE,
  FILTER_ALL,
  FILTER_MEAL_TYPE,
  FILTER_NO_RESULTS_BODY,
  FILTER_NO_RESULTS_TITLE,
  FILTER_OPEN,
  FILTER_REVIEWED,
  HIDE_MY_TAGS,
  HISTORY_TITLE,
  SEARCH_GROUP_ALL,
  SEARCH_GROUP_SOME,
  SEARCH_NO_RESULTS_BODY,
  SEARCH_NO_RESULTS_TITLE,
  SEARCH_PLACEHOLDER,
  SHOW_MY_TAGS,
  STATUS_OPEN,
  UNSAVED_KEPT,
  UNTITLED_COOK,
  WHO_AND_STARS,
  WHO_AND_STARS_PICK,
  atLeastStars,
} from '../content/product';
import { MEAL_TYPE_LABELS } from '../domain/cookRecord';
import type { Cook, CookId } from '../domain/entities';
import {
  STAR_VALUES,
  STORED_MEAL_TYPES,
  type CookStatus,
  type Stars,
  type StoredMealType,
} from '../domain/enums';
import { formatDateTime } from '../format/dateTime';
import { MIN_TOUCH_TARGET, colors, radius, space } from '../theme/tokens';
import { CookActions } from './CookActions';
import { CookCard } from './HomeScreen';
import {
  applyFilters,
  filtersActive,
  peopleToPick,
  samePick,
  type CookFilters,
  type PersonPick,
} from './history/filters';
import {
  searchCooks,
  searchable,
  type HighlightedSegment,
  type SearchHit,
} from './history/search';

type Filter = 'all' | CookStatus;

/**
 * An empty list means something different under each filter. "No cooks yet"
 * under Open, when every cook has simply been reviewed, describes an empty
 * notebook rather than an empty filter — and was read that way on the Fold.
 */
export function emptyStateFor(filter: Filter): { title: string; body: string } {
  switch (filter) {
    case 'open':
      return { title: EMPTY_OPEN_TITLE, body: EMPTY_OPEN_BODY };
    case 'reviewed':
      return { title: EMPTY_REVIEWED_TITLE, body: EMPTY_REVIEWED_BODY };
    case 'all':
      return { title: EMPTY_HISTORY_TITLE, body: EMPTY_HISTORY_BODY };
  }
}

const FILTERS: readonly { key: Filter; label: string }[] = [
  { key: 'all', label: FILTER_ALL },
  { key: 'open', label: FILTER_OPEN },
  { key: 'reviewed', label: FILTER_REVIEWED },
];

type HistoryScreenProps = {
  onOpenCook: (cookId: CookId) => void;
  onBack: () => void;
  /** Bumped by the route when the screen regains focus, to reload. */
  refreshToken?: number;
};

/**
 * History: every cook, newest first, searchable by what it was about.
 *
 * The search sits above the filters and works with them rather than instead of
 * them: searching inside *Open* searches the open cooks. Typed words match
 * title words and tag names; a tag tapped from *Show me my tags* joins the
 * search as one whole term, so "brown butter" stays the thing the kitchen
 * named rather than two colours of word.
 *
 * Results come in two groups. **All** is the cooks that matched every term, and
 * **Some** is the cooks that matched part of it, best first — so a search for
 * two words still finds the cook that was only about one of them instead of
 * quietly hiding it.
 */
export function HistoryScreen({ onOpenCook, onBack, refreshToken = 0 }: HistoryScreenProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [typed, setTyped] = useState('');
  const [pickedTags, setPickedTags] = useState<readonly string[]>([]);
  const [showingTags, setShowingTags] = useState(false);
  const [actionsFor, setActionsFor] = useState<Cook | null>(null);
  const [mealFilter, setMealFilter] = useState<readonly StoredMealType[]>([]);
  const [who, setWho] = useState<CookFilters['who']>(null);
  const [whoOpen, setWhoOpen] = useState(false);
  const [whoPerson, setWhoPerson] = useState<PersonPick | null>(null);
  // A cook deleted, or brought back with Undo, changes the list and the tags.
  const { version } = usePendingDeletion();
  const reload = refreshToken + version;

  const list = useCookList(
    filter === 'all' ? { sort: 'newest_first' } : { status: filter, sort: 'newest_first' },
    reload,
  );
  const cooks = list.status === 'ready' ? list.cooks : [];
  const tagIndex = useTagIndex(
    cooks.map((cook) => cook.id),
    reload,
  );

  const index = useHistoryIndex(
    cooks.map((cook) => cook.id),
    reload,
  );
  const mealTypes = list.status === 'ready' ? list.mealTypes : {};
  const filters: CookFilters = { mealTypes: mealFilter, who };
  const filtering = filtersActive(filters);
  const shown = applyFilters(cooks, { mealTypes, ratingsByCook: index.ratingsByCook }, filters);

  const results = searchCooks(searchable(shown, tagIndex.byCook, index.ingredientsByCook), {
    typed,
    pickedTags,
  });
  const searching = results.terms.length > 0;
  const found = results.all.length + results.some.length;
  const people = peopleToPick(index.household, index.guestNames);
  const nameOf = (pick: PersonPick): string =>
    people.find((person) => samePick(person.pick, pick))?.name ?? (pick.kind === 'guest' ? pick.name : '');

  const toggleMeal = (mealType: StoredMealType) => {
    setMealFilter((picked) =>
      picked.includes(mealType) ? picked.filter((value) => value !== mealType) : [...picked, mealType],
    );
  };

  const chooseStars = (minStars: Stars) => {
    if (whoPerson === null) {
      return;
    }
    setWho({ person: whoPerson, minStars });
    setWhoOpen(false);
  };

  const clearFilters = () => {
    setMealFilter([]);
    setWho(null);
    setWhoPerson(null);
    setWhoOpen(false);
  };

  const toggleTag = (name: string) => {
    setPickedTags((picked) =>
      picked.includes(name) ? picked.filter((tag) => tag !== name) : [...picked, name],
    );
  };

  const clearSearch = () => {
    setTyped('');
    setPickedTags([]);
  };

  return (
    <ScreenContainer testID="history-screen">
      <ScreenHeader title={HISTORY_TITLE} onBack={onBack} />

      <View style={styles.search}>
        <TextField
          value={typed}
          onChangeText={setTyped}
          placeholder={SEARCH_PLACEHOLDER}
          accessibilityLabel={SEARCH_PLACEHOLDER}
          autoCapitalize="none"
          autoCorrect={false}
          testID="history-search"
        />
        {pickedTags.length > 0 ? (
          <View style={styles.chips} testID="history-picked-tags">
            {pickedTags.map((name) => (
              <TagChip
                key={name}
                name={name}
                variant="selected"
                onPress={() => toggleTag(name)}
                testID={`history-picked-${name}`}
              />
            ))}
          </View>
        ) : null}
        {searching ? (
          <View style={styles.searchActions}>
            <ActionButton
              label={CLEAR_SEARCH}
              variant="quiet"
              onPress={clearSearch}
              testID="history-clear-search"
            />
          </View>
        ) : null}
      </View>

      <View style={styles.filters} accessibilityRole="tablist" testID="history-filters">
        {FILTERS.map(({ key, label }) => {
          const selected = key === filter;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              onPress={() => setFilter(key)}
              style={[styles.filter, selected && styles.filterSelected]}
              testID={`history-filter-${key}`}
            >
              <AppText variant="label" tone={selected ? 'onPrimary' : 'primary'}>
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.filterBlock} testID="history-meal-filter">
        <AppText variant="label" tone="muted">
          {FILTER_MEAL_TYPE}
        </AppText>
        <View style={styles.chips}>
          {STORED_MEAL_TYPES.map((mealType) => {
            const selected = mealFilter.includes(mealType);
            return (
              <Pressable
                key={mealType}
                accessibilityRole="checkbox"
                accessibilityLabel={MEAL_TYPE_LABELS[mealType]}
                accessibilityState={{ checked: selected }}
                onPress={() => toggleMeal(mealType)}
                style={[styles.filter, selected && styles.filterSelected]}
                testID={`history-meal-${mealType}`}
              >
                <AppText variant="label" tone={selected ? 'onPrimary' : 'primary'}>
                  {selected ? `✓ ${MEAL_TYPE_LABELS[mealType]}` : MEAL_TYPE_LABELS[mealType]}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.filterBlock} testID="history-who-filter">
        {who !== null ? (
          <TagChip
            name={`${nameOf(who.person)} · ${atLeastStars(who.minStars)}`}
            variant="removable"
            onPress={() => setWho(null)}
            testID="history-who-active"
          />
        ) : null}
        {people.length > 0 ? (
          <ActionButton
            label={WHO_AND_STARS}
            variant="quiet"
            accessibilityHint="Pick a person and a least number of stars"
            onPress={() => setWhoOpen((now) => !now)}
            style={styles.showTags}
            testID="history-who-toggle"
          />
        ) : null}
        {whoOpen ? (
          <View style={styles.whoPanel} testID="history-who-panel">
            <AppText variant="label" tone="muted">
              {WHO_AND_STARS_PICK}
            </AppText>
            <View style={styles.chips}>
              {people.map((person) => (
                <TagChip
                  key={person.key}
                  name={person.name}
                  variant={whoPerson !== null && samePick(whoPerson, person.pick) ? 'selected' : 'pick'}
                  onPress={() => setWhoPerson(person.pick)}
                  testID={`history-who-${person.key}`}
                />
              ))}
            </View>
            {whoPerson !== null ? (
              <View style={styles.chips}>
                {STAR_VALUES.map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={atLeastStars(value)}
                    onPress={() => chooseStars(value)}
                    style={styles.filter}
                    testID={`history-who-stars-${value}`}
                  >
                    <AppText variant="label" tone="primary" importantForAccessibility="no">
                      {`${value}★+`}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        {filtering ? (
          <ActionButton
            label={CLEAR_FILTERS}
            variant="quiet"
            onPress={clearFilters}
            style={styles.showTags}
            testID="history-clear-filters"
          />
        ) : null}
      </View>

      {tagIndex.allTags.length > 0 ? (
        <ActionButton
          label={showingTags ? HIDE_MY_TAGS : SHOW_MY_TAGS}
          variant="quiet"
          onPress={() => setShowingTags((open) => !open)}
          style={styles.showTags}
          testID="history-show-my-tags"
        />
      ) : null}

      {showingTags ? (
        <View style={[styles.chips, styles.tagList]} testID="history-all-tags">
          {tagIndex.allTags.map((tag) => (
            <TagChip
              key={tag.id}
              name={tag.name}
              variant={pickedTags.includes(tag.name) ? 'selected' : 'pick'}
              onPress={() => toggleTag(tag.name)}
              testID={`history-tag-${tag.id}`}
            />
          ))}
        </View>
      ) : null}

      {list.status === 'failed' ? (
        <StateNotice
          title="Your cooks could not be listed"
          body={`${list.message} ${UNSAVED_KEPT}`}
          tone="problem"
        />
      ) : null}

      {list.status === 'ready' && !searching && cooks.length === 0 ? (
        <StateNotice {...emptyStateFor(filter)} testID="history-empty" />
      ) : null}

      {list.status === 'ready' && !searching && cooks.length > 0 && filtering && shown.length === 0 ? (
        <StateNotice
          title={FILTER_NO_RESULTS_TITLE}
          body={FILTER_NO_RESULTS_BODY}
          testID="history-filter-empty"
        />
      ) : null}

      {list.status === 'ready' && searching && found === 0 ? (
        <StateNotice
          title={SEARCH_NO_RESULTS_TITLE}
          body={SEARCH_NO_RESULTS_BODY}
          testID="history-search-empty"
        />
      ) : null}

      {list.status === 'ready' && !searching ? (
        <View style={styles.list} testID="history-list">
          {shown.map((cook) => (
            <CookCard
              key={cook.id}
              cook={cook}
              mealType={mealTypes[cook.id] ?? null}
              verdict={list.status === 'ready' ? (list.verdicts[cook.id] ?? cook.verdict) : cook.verdict}
              onPress={() => onOpenCook(cook.id)}
              onLongPress={() => setActionsFor(cook)}
            />
          ))}
        </View>
      ) : null}

      {list.status === 'ready' && searching ? (
        <View style={styles.list} testID="history-results">
          <HitGroup
            label={SEARCH_GROUP_ALL}
            hits={results.all}
            mealTypes={mealTypes}
            onOpenCook={onOpenCook}
            onActions={setActionsFor}
            testID="history-group-all"
          />
          <HitGroup
            label={SEARCH_GROUP_SOME}
            hits={results.some}
            mealTypes={mealTypes}
            onOpenCook={onOpenCook}
            onActions={setActionsFor}
            testID="history-group-some"
          />
        </View>
      ) : null}

      <CookActions cook={actionsFor} onClose={() => setActionsFor(null)} />
    </ScreenContainer>
  );
}

type HitGroupProps = {
  label: string;
  hits: readonly SearchHit[];
  mealTypes: Readonly<Record<CookId, StoredMealType>>;
  onOpenCook: (cookId: CookId) => void;
  onActions: (cook: Cook) => void;
  testID: string;
};

/** One of the two result groups. An empty group is not drawn at all. */
function HitGroup({ label, hits, mealTypes, onOpenCook, onActions, testID }: HitGroupProps) {
  if (hits.length === 0) {
    return null;
  }
  return (
    <View style={styles.group} testID={testID}>
      <AppText variant="sectionTitle">{label}</AppText>
      {hits.map((hit) => (
        <HitCard
          key={hit.cook.id}
          hit={hit}
          mealType={mealTypes[hit.cook.id] ?? null}
          onPress={() => onOpenCook(hit.cook.id)}
          onLongPress={() => onActions(hit.cook)}
        />
      ))}
    </View>
  );
}

/**
 * A result: the cook, with the words that matched picked out.
 *
 * The tag line is shown whenever the cook has tags, matched or not, so it is
 * obvious *why* a cook is in the list — a search for "cider" that matched a tag
 * rather than the title would otherwise look like a mistake.
 */
function HitCard({
  hit,
  mealType,
  onPress,
  onLongPress,
}: {
  hit: SearchHit;
  mealType: StoredMealType | null;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { cook } = hit;
  const title = cook.title ?? UNTITLED_COOK;

  return (
    <Card
      onPress={onPress}
      onLongPress={onLongPress}
      longPressLabel={DELETE_COOK}
      accessibilityLabel={`${title}, ${formatDateTime(cook.startedAt)}`}
      accessibilityHint={cook.status === 'open' ? 'Continue this cook' : 'Open this cook'}
      testID={`cook-card-${cook.id}`}
    >
      <MealTypeLabel mealType={mealType} testID={`cook-meal-${cook.id}`} />
      <View style={styles.cardRow}>
        <AppText variant="bodyStrong" tone={cook.title ? 'text' : 'muted'} style={styles.cardTitle}>
          {cook.title === null ? UNTITLED_COOK : <Highlighted segments={hit.title} />}
        </AppText>
        {cook.status === 'open' ? <StatusChip status="open" label={STATUS_OPEN} /> : null}
      </View>
      <AppText variant="caption" tone="muted">
        {formatDateTime(cook.startedAt)}
      </AppText>
      {hit.tags.length > 0 ? (
        <AppText variant="secondary" tone="muted" testID={`cook-tags-line-${cook.id}`}>
          <Highlighted segments={hit.tagLine} />
        </AppText>
      ) : null}
      {hit.ingredientLine.length > 0 ? (
        <AppText variant="secondary" tone="muted" testID={`cook-ingredients-line-${cook.id}`}>
          <Highlighted segments={hit.ingredientLine} />
        </AppText>
      ) : null}
    </Card>
  );
}

/**
 * Text with the matched runs picked out.
 *
 * Bold and a soft sage behind it, not colour alone: a highlight that was only a
 * tint would be invisible to some of the people reading it, and weight carries
 * the same information everywhere.
 */
function Highlighted({ segments }: { segments: readonly HighlightedSegment[] }) {
  return (
    <>
      {segments.map((segment, index) => (
        <AppText
          // Segments have no identity of their own; their position is their
          // identity, and the list is rebuilt whole on every keystroke.
          key={`${index}-${segment.text}`}
          variant={segment.matched ? 'bodyStrong' : 'secondary'}
          style={segment.matched ? styles.match : undefined}
        >
          {segment.text}
        </AppText>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  search: {
    gap: space.xs,
    marginBottom: space.sm,
  },
  searchActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginBottom: space.md,
  },
  filter: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  showTags: {
    alignSelf: 'flex-start',
    marginBottom: space.xs,
  },
  filterBlock: {
    gap: space.xs,
    marginBottom: space.sm,
  },
  whoPanel: {
    gap: space.xs,
  },
  tagList: {
    marginBottom: space.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  list: {
    gap: space.xs,
  },
  group: {
    gap: space.xs,
    marginBottom: space.md,
  },
  match: {
    backgroundColor: colors.primarySoft,
    color: colors.text,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  cardTitle: {
    flexShrink: 1,
  },
});

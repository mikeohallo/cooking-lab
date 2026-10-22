import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useCookList } from '../state/useCookList';
import { useTagIndex } from '../state/useTagIndex';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateNotice } from '../components/StateNotice';
import { StatusChip } from '../components/StatusChip';
import { TagChip } from '../components/TagChip';
import { TextField } from '../components/TextField';
import {
  CLEAR_SEARCH,
  EMPTY_HISTORY_BODY,
  EMPTY_HISTORY_TITLE,
  EMPTY_OPEN_BODY,
  EMPTY_OPEN_TITLE,
  EMPTY_REVIEWED_BODY,
  EMPTY_REVIEWED_TITLE,
  FILTER_ALL,
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
} from '../content/product';
import type { CookId } from '../domain/entities';
import type { CookStatus } from '../domain/enums';
import { formatDateTime } from '../format/dateTime';
import { MIN_TOUCH_TARGET, colors, radius, space } from '../theme/tokens';
import { CookCard } from './HomeScreen';
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

  const list = useCookList(
    filter === 'all' ? { sort: 'newest_first' } : { status: filter, sort: 'newest_first' },
    refreshToken,
  );
  const cooks = list.status === 'ready' ? list.cooks : [];
  const tagIndex = useTagIndex(
    cooks.map((cook) => cook.id),
    refreshToken,
  );

  const results = searchCooks(searchable(cooks, tagIndex.byCook), { typed, pickedTags });
  const searching = results.terms.length > 0;
  const found = results.all.length + results.some.length;

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

      {list.status === 'ready' && searching && found === 0 ? (
        <StateNotice
          title={SEARCH_NO_RESULTS_TITLE}
          body={SEARCH_NO_RESULTS_BODY}
          testID="history-search-empty"
        />
      ) : null}

      {list.status === 'ready' && !searching ? (
        <View style={styles.list} testID="history-list">
          {cooks.map((cook) => (
            <CookCard key={cook.id} cook={cook} onPress={() => onOpenCook(cook.id)} />
          ))}
        </View>
      ) : null}

      {list.status === 'ready' && searching ? (
        <View style={styles.list} testID="history-results">
          <HitGroup
            label={SEARCH_GROUP_ALL}
            hits={results.all}
            onOpenCook={onOpenCook}
            testID="history-group-all"
          />
          <HitGroup
            label={SEARCH_GROUP_SOME}
            hits={results.some}
            onOpenCook={onOpenCook}
            testID="history-group-some"
          />
        </View>
      ) : null}
    </ScreenContainer>
  );
}

type HitGroupProps = {
  label: string;
  hits: readonly SearchHit[];
  onOpenCook: (cookId: CookId) => void;
  testID: string;
};

/** One of the two result groups. An empty group is not drawn at all. */
function HitGroup({ label, hits, onOpenCook, testID }: HitGroupProps) {
  if (hits.length === 0) {
    return null;
  }
  return (
    <View style={styles.group} testID={testID}>
      <AppText variant="sectionTitle">{label}</AppText>
      {hits.map((hit) => (
        <HitCard key={hit.cook.id} hit={hit} onPress={() => onOpenCook(hit.cook.id)} />
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
function HitCard({ hit, onPress }: { hit: SearchHit; onPress: () => void }) {
  const { cook } = hit;
  const title = cook.title ?? UNTITLED_COOK;

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${title}, ${formatDateTime(cook.startedAt)}`}
      accessibilityHint={cook.status === 'open' ? 'Continue this cook' : 'Open this cook'}
      testID={`cook-card-${cook.id}`}
    >
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

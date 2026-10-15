import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useCookList } from '../state/useCookList';
import { AppText } from '../components/AppText';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateNotice } from '../components/StateNotice';
import {
  EMPTY_HISTORY_BODY,
  EMPTY_HISTORY_TITLE,
  FILTER_ALL,
  FILTER_OPEN,
  FILTER_REVIEWED,
  HISTORY_TITLE,
  UNSAVED_KEPT,
} from '../content/product';
import type { CookId } from '../domain/entities';
import type { CookStatus } from '../domain/enums';
import { MIN_TOUCH_TARGET, colors, radius, space } from '../theme/tokens';
import { CookCard } from './HomeScreen';

type Filter = 'all' | CookStatus;

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
 * History: every cook, newest first, with a simple status filter. No search
 * and no tags yet; those are later milestones with their own screens.
 */
export function HistoryScreen({ onOpenCook, onBack, refreshToken = 0 }: HistoryScreenProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const list = useCookList(
    filter === 'all' ? { sort: 'newest_first' } : { status: filter, sort: 'newest_first' },
    refreshToken,
  );

  return (
    <ScreenContainer testID="history-screen">
      <ScreenHeader title={HISTORY_TITLE} onBack={onBack} />

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

      {list.status === 'failed' ? (
        <StateNotice
          title="Your cooks could not be listed"
          body={`${list.message} ${UNSAVED_KEPT}`}
          tone="problem"
        />
      ) : null}

      {list.status === 'ready' && list.cooks.length === 0 ? (
        <StateNotice title={EMPTY_HISTORY_TITLE} body={EMPTY_HISTORY_BODY} testID="history-empty" />
      ) : null}

      {list.status === 'ready' ? (
        <View style={styles.list} testID="history-list">
          {list.cooks.map((cook) => (
            <CookCard key={cook.id} cook={cook} onPress={() => onOpenCook(cook.id)} />
          ))}
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
  list: {
    gap: space.xs,
  },
});

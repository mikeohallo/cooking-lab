import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { FilterChip } from '../../components/FilterChip';
import {
  FILTERS,
  FILTER_CLEAR,
  FILTER_CUISINE_OVERLINE,
  FILTER_TAGS_OVERLINE,
  FILTER_WHO_OVERLINE,
  atLeastStars,
  showCooks,
  starsAndUp,
} from '../../content/product';
import type { Tag } from '../../domain/entities';
import { STAR_VALUES, type Stars } from '../../domain/enums';
import { PaneSheet } from '../../layout/panes';
import { makeStyles } from '../../theme/theme';
import { space } from '../../theme/tokens';
import {
  sameCuisinePick,
  samePick,
  type CuisineOption,
  type CuisinePick,
  type PersonPick,
  type WhoAndStars,
} from '../history/filters';

/** What the sheet chooses: who and how many stars, cuisines, and tags. */
export type SheetFilters = {
  readonly who: WhoAndStars | null;
  readonly cuisines: readonly CuisinePick[];
  readonly tags: readonly string[];
};

export const NO_SHEET_FILTERS: SheetFilters = { who: null, cuisines: [], tags: [] };

/** How many filters the sheet has on: the count on the round filter button. */
export function sheetFilterCount(filters: SheetFilters): number {
  return (filters.who === null ? 0 : 1) + filters.cuisines.length + filters.tags.length;
}

type FiltersSheetProps = {
  visible: boolean;
  /** As they are on Home now; the sheet starts from these each time it opens. */
  current: SheetFilters;
  people: readonly { readonly pick: PersonPick; readonly name: string; readonly key: string }[];
  cuisines: readonly CuisineOption[];
  tags: readonly Tag[];
  /** How many cooks these filters would show, for "Show N cooks". */
  countFor: (filters: SheetFilters) => number;
  onApply: (filters: SheetFilters) => void;
  onClose: () => void;
};

/**
 * Filters (0.4.0): a sheet over Home with WHO & STARS, CUISINE (the ten in
 * order, then any Other words in use) and TAGS. Chosen chips are navy with a
 * tick. Clear empties the choices; "Show N cooks" counts as you choose and
 * puts them on Home. Closing the sheet any other way changes nothing.
 */
export function FiltersSheet(props: FiltersSheetProps) {
  return (
    <PaneSheet visible={props.visible} onRequestClose={props.onClose} testID="filters-sheet">
      {(insets) => <FiltersBody {...props} bottomInset={insets.bottom} />}
    </PaneSheet>
  );
}

function FiltersBody({
  current,
  people,
  cuisines,
  tags,
  countFor,
  onApply,
  onClose,
  bottomInset,
}: FiltersSheetProps & { bottomInset: number }) {
  const styles = useStyles();
  const [person, setPerson] = useState<PersonPick | null>(current.who?.person ?? null);
  const [minStars, setMinStars] = useState<Stars | null>(current.who?.minStars ?? null);
  const [picked, setPicked] = useState<readonly CuisinePick[]>(current.cuisines);
  const [pickedTags, setPickedTags] = useState<readonly string[]>(current.tags);

  const draft: SheetFilters = {
    who: person !== null && minStars !== null ? { person, minStars } : null,
    cuisines: picked,
    tags: pickedTags,
  };
  const count = countFor(draft);

  const clear = () => {
    setPerson(null);
    setMinStars(null);
    setPicked([]);
    setPickedTags([]);
  };

  return (
    <BottomSheet
      title={FILTERS}
      onClose={onClose}
      bottomInset={bottomInset}
      testID="filters"
      foot={
        <>
          <Button label={FILTER_CLEAR} variant="text" onPress={clear} testID="filters-clear" />
          <Button
            label={showCooks(count)}
            variant="main"
            size="main"
            onPress={() => onApply(draft)}
            testID="filters-show"
          />
        </>
      }
    >
      {people.length > 0 ? (
        <View style={styles.group} testID="filters-who">
          <AppText variant="overline" tone="inkMuted" accessibilityRole="header">
            {FILTER_WHO_OVERLINE}
          </AppText>
          <View style={styles.chips}>
            {people.map((option) => {
              const on = person !== null && samePick(person, option.pick);
              return (
                <FilterChip
                  key={option.key}
                  label={option.name}
                  selected={on}
                  tick
                  role="radio"
                  onPress={() => setPerson(on ? null : option.pick)}
                  testID={`filters-who-${option.key}`}
                />
              );
            })}
            {person !== null
              ? STAR_VALUES.map((value) => (
                  <FilterChip
                    key={value}
                    label={starsAndUp(value)}
                    selected={minStars === value}
                    tick
                    role="radio"
                    accessibilityHint={atLeastStars(value)}
                    onPress={() => setMinStars(minStars === value ? null : value)}
                    testID={`filters-stars-${value}`}
                  />
                ))
              : null}
          </View>
        </View>
      ) : null}

      <View style={styles.group} testID="filters-cuisine">
        <AppText variant="overline" tone="inkMuted" accessibilityRole="header">
          {FILTER_CUISINE_OVERLINE}
        </AppText>
        <View style={styles.chips}>
          {cuisines.map((option) => {
            const on = picked.some((pick) => sameCuisinePick(pick, option.pick));
            return (
              <FilterChip
                key={option.key}
                label={option.label}
                selected={on}
                tick
                onPress={() =>
                  setPicked((now) =>
                    on ? now.filter((pick) => !sameCuisinePick(pick, option.pick)) : [...now, option.pick],
                  )
                }
                testID={`filters-${option.key}`}
              />
            );
          })}
        </View>
      </View>

      {tags.length > 0 ? (
        <View style={styles.group} testID="filters-tags">
          <AppText variant="overline" tone="inkMuted" accessibilityRole="header">
            {FILTER_TAGS_OVERLINE}
          </AppText>
          <View style={styles.chips}>
            {tags.map((tag) => {
              const on = pickedTags.includes(tag.name);
              return (
                <FilterChip
                  key={tag.id}
                  label={tag.name}
                  selected={on}
                  tick
                  onPress={() =>
                    setPickedTags((now) => (on ? now.filter((name) => name !== tag.name) : [...now, tag.name]))
                  }
                  testID={`filters-tag-${tag.id}`}
                />
              );
            })}
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    group: {
      gap: space.xxs,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: space.xs,
    },
  }),
);

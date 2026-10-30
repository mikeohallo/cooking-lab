import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from '../../components/ActionButton';
import { AppText } from '../../components/AppText';
import { MealTypeDot } from '../../components/MealTypeLabel';
import { TagChip } from '../../components/TagChip';
import { TextField } from '../../components/TextField';
import {
  CLEAR_FILTERS,
  CLEAR_SEARCH,
  FILTER_MEAL_TYPE,
  HIDE_MY_TAGS,
  SEARCH_PLACEHOLDER,
  SHOW_MY_TAGS,
  WHO_AND_STARS,
  WHO_AND_STARS_PICK,
  atLeastStars,
} from '../../content/product';
import { MEAL_TYPE_LABELS } from '../../domain/cookRecord';
import type { HouseholdMember, Tag } from '../../domain/entities';
import { STAR_VALUES, STORED_MEAL_TYPES, type Stars, type StoredMealType } from '../../domain/enums';
import { MIN_TOUCH_TARGET, colors, radius, space } from '../../theme/tokens';
import { peopleToPick, samePick, type CookFilters, type PersonPick } from '../history/filters';

type SearchPanelProps = {
  typed: string;
  onType: (text: string) => void;
  pickedTags: readonly string[];
  onPickTags: (update: (picked: readonly string[]) => readonly string[]) => void;
  mealFilter: readonly StoredMealType[];
  onMealFilter: (update: (picked: readonly StoredMealType[]) => readonly StoredMealType[]) => void;
  who: CookFilters['who'];
  onWho: (who: CookFilters['who']) => void;
  allTags: readonly Tag[];
  household: readonly HouseholdMember[];
  guestNames: readonly string[];
};

/**
 * Home's search box and the filters under it (0.3.0; History's until then).
 *
 * Typed words match title words, tag names and ingredients; a tag tapped from
 * *Show me my tags* joins the search as one whole term, so "brown butter"
 * stays the thing the kitchen named rather than two colours of word. The
 * meal-type chips keep any of the ones picked; Who & stars keeps the cooks one
 * person gave at least that many stars. They all combine.
 */
export function SearchPanel({
  typed,
  onType,
  pickedTags,
  onPickTags,
  mealFilter,
  onMealFilter,
  who,
  onWho,
  allTags,
  household,
  guestNames,
}: SearchPanelProps) {
  const [showingTags, setShowingTags] = useState(false);
  const [whoOpen, setWhoOpen] = useState(false);
  const [whoPerson, setWhoPerson] = useState<PersonPick | null>(null);
  const people = peopleToPick(household, guestNames);
  const nameOf = (pick: PersonPick): string =>
    people.find((person) => samePick(person.pick, pick))?.name ?? (pick.kind === 'guest' ? pick.name : '');
  const searching = typed.trim() !== '' || pickedTags.length > 0;
  const filtering = mealFilter.length > 0 || who !== null;

  const toggleTag = (name: string) =>
    onPickTags((picked) => (picked.includes(name) ? picked.filter((tag) => tag !== name) : [...picked, name]));

  const toggleMeal = (mealType: StoredMealType) =>
    onMealFilter((picked) =>
      picked.includes(mealType) ? picked.filter((value) => value !== mealType) : [...picked, mealType],
    );

  const chooseStars = (minStars: Stars) => {
    if (whoPerson === null) {
      return;
    }
    onWho({ person: whoPerson, minStars });
    setWhoOpen(false);
  };

  const clearFilters = () => {
    onMealFilter(() => []);
    onWho(null);
    setWhoPerson(null);
    setWhoOpen(false);
  };

  return (
    <View style={styles.panel}>
      <TextField
        value={typed}
        onChangeText={onType}
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
        <View style={styles.end}>
          <ActionButton
            label={CLEAR_SEARCH}
            variant="quiet"
            onPress={() => {
              onType('');
              onPickTags(() => []);
            }}
            testID="history-clear-search"
          />
        </View>
      ) : null}

      <View
        style={styles.chips}
        accessibilityLabel={FILTER_MEAL_TYPE}
        testID="history-meal-filter"
      >
        {STORED_MEAL_TYPES.map((mealType) => {
          const selected = mealFilter.includes(mealType);
          return (
            <Pressable
              key={mealType}
              accessibilityRole="checkbox"
              accessibilityLabel={MEAL_TYPE_LABELS[mealType]}
              accessibilityState={{ checked: selected }}
              onPress={() => toggleMeal(mealType)}
              style={[styles.chip, selected && styles.chipSelected]}
              testID={`history-meal-${mealType}`}
            >
              <MealTypeDot mealType={mealType} />
              <AppText variant="label" tone={selected ? 'onPrimary' : 'primary'}>
                {selected ? `✓ ${MEAL_TYPE_LABELS[mealType]}` : MEAL_TYPE_LABELS[mealType]}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.row} testID="history-who-filter">
        {who !== null ? (
          <TagChip
            name={`${nameOf(who.person)} · ${atLeastStars(who.minStars)}`}
            variant="removable"
            onPress={() => onWho(null)}
            testID="history-who-active"
          />
        ) : null}
        {people.length > 0 ? (
          <ActionButton
            label={WHO_AND_STARS}
            variant="quiet"
            accessibilityHint="Pick a person and a least number of stars"
            onPress={() => setWhoOpen((now) => !now)}
            testID="history-who-toggle"
          />
        ) : null}
        {allTags.length > 0 ? (
          <ActionButton
            label={showingTags ? HIDE_MY_TAGS : SHOW_MY_TAGS}
            variant="quiet"
            onPress={() => setShowingTags((now) => !now)}
            testID="history-show-my-tags"
          />
        ) : null}
        {filtering ? (
          <ActionButton
            label={CLEAR_FILTERS}
            variant="quiet"
            onPress={clearFilters}
            testID="history-clear-filters"
          />
        ) : null}
      </View>

      {whoOpen ? (
        <View style={styles.panel} testID="history-who-panel">
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
                  style={styles.chip}
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

      {showingTags ? (
        <View style={styles.chips} testID="history-all-tags">
          {allTags.map((tag) => (
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
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: space.xs,
  },
  end: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.xxs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});

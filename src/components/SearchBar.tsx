import { forwardRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { fontStyleFor, useFontsReady } from '../theme/fonts';
import { makeStyles, useColors } from '../theme/theme';
import { radius, size, space, type } from '../theme/tokens';
import { touchSlop } from '../theme/touch';
import { AppText } from './AppText';
import { Icon } from './Icon';

type SearchBarProps = Omit<TextInputProps, 'style' | 'placeholderTextColor' | 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
  /** The round filter button beside the bar, with the count of filters on. */
  onFilters?: () => void;
  filterCount?: number;
  filtersLabel?: string;
  clearLabel?: string;
};

/**
 * The search over your cooks: a pill on surface-raised with a magnifier, a ×
 * once there is text, and the round filter button beside it showing how many
 * filters are on.
 *
 * The placeholder is drawn here rather than by the text box (0.4.0, part 5):
 * one line, ending with an ellipsis when the bar is too narrow for it, where
 * Android's own placeholder either wrapped or was cut hard at the edge.
 */
export const SearchBar = forwardRef<TextInput, SearchBarProps>(function SearchBar(
  {
    value,
    onChangeText,
    onFilters,
    filterCount = 0,
    filtersLabel = 'Filters',
    clearLabel = 'Clear search',
    placeholder,
    ...input
  },
  ref,
) {
  const styles = useStyles();
  const colors = useColors();
  const fontsReady = useFontsReady();
  return (
    <View style={styles.row}>
      <View style={styles.bar}>
        <Icon name="search" color="inkMuted" size={size.icon - 4} />
        <View style={styles.field}>
          {placeholder && value === '' ? (
            <AppText
              tone="inkMuted"
              numberOfLines={1}
              ellipsizeMode="tail"
              importantForAccessibility="no"
              accessibilityElementsHidden
              pointerEvents="none"
              style={styles.placeholder}
              testID="search-placeholder"
            >
              {placeholder}
            </AppText>
          ) : null}
          <TextInput
            ref={ref}
            {...input}
            value={value}
            onChangeText={onChangeText}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={input.accessibilityLabel ?? placeholder}
            style={[styles.input, fontsReady ? fontStyleFor(type.body.fontWeight) : null]}
          />
        </View>
        {value.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={clearLabel}
            onPress={() => onChangeText('')}
            hitSlop={CLEAR_SLOP}
            style={styles.clear}
            testID="search-clear"
          >
            <Icon name="close" color="inkMuted" size={size.icon - 6} />
          </Pressable>
        ) : null}
      </View>
      {onFilters ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={filterCount > 0 ? `${filtersLabel}, ${filterCount} on` : filtersLabel}
          onPress={onFilters}
          hitSlop={FILTER_SLOP}
          style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}
          testID="search-filters"
        >
          <Icon name="filter" color="ink" size={size.icon - 2} />
          {filterCount > 0 ? (
            <View style={styles.count}>
              <AppText variant="label" tone="onSelected">
                {String(filterCount)}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
});

/** The × and the filter button are drawn smaller than 48; their hit areas make 48. */
const CLEAR_SLOP = touchSlop(size.inlineButton, size.inlineButton);
const FILTER_SLOP = touchSlop(size.filterButton, size.filterButton);

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    bar: {
      flex: 1,
      minHeight: size.targetMin,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      paddingLeft: space.md,
      paddingRight: space.xxs,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceRaised,
    },
    field: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
    },
    placeholder: {
      position: 'absolute',
      left: 0,
      right: 0,
    },
    input: {
      minHeight: size.targetMin,
      paddingHorizontal: 0,
      color: colors.ink,
      fontSize: type.body.fontSize,
      lineHeight: type.body.lineHeight,
      paddingVertical: 0,
    },
    clear: {
      width: size.inlineButton,
      height: size.inlineButton,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
    },
    filterButton: {
      width: size.filterButton,
      height: size.filterButton,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    count: {
      position: 'absolute',
      top: 0,
      right: 0,
      minWidth: size.badge,
      height: size.badge,
      paddingHorizontal: space.xxs,
      borderRadius: radius.pill,
      backgroundColor: colors.selected,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.8,
    },
  }),
);

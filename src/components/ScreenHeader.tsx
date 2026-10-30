import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH_TARGET, colors, radius, space } from '../theme/tokens';
import { AppText } from './AppText';

type ScreenHeaderProps = {
  title: string;
  /** A short secondary line under the title: a date, a status. */
  subtitle?: string;
  onBack?: () => void;
  /** Something placed on the trailing side — a chip, a small action. */
  trailing?: ReactNode;
  /** Replaces the plain title with the caller's own title element (an inline editor, say). */
  titleSlot?: ReactNode;
  /** A small line above the title, e.g. a cook's meal type (0.3.0). */
  eyebrow?: ReactNode;
  /** A line under the subtitle, e.g. "2nd time cooking this". */
  footnote?: ReactNode;
};

/**
 * The header of a pushed task screen: back, title, and room for one action.
 * Home keeps its own compact brand row (`ShellHeader`); this is for everything
 * reached from it.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  trailing,
  titleSlot,
  eyebrow,
  footnote,
}: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
            testID="screen-back"
          >
            <AppText variant="bodyStrong" tone="accent">
              ‹ Back
            </AppText>
          </Pressable>
        ) : null}
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      <View style={styles.titleBlock}>
        {eyebrow ?? null}
        {titleSlot ?? (
          <AppText variant="screenTitle" accessibilityRole="header">
            {title}
          </AppText>
        )}
        {subtitle ? <AppText variant="secondary" tone="muted">{subtitle}</AppText> : null}
        {footnote ?? null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: space.xs,
    marginBottom: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH_TARGET,
  },
  back: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingRight: space.sm,
    borderRadius: radius.control,
  },
  backPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  trailing: {
    marginLeft: 'auto',
    flexShrink: 1,
  },
  titleBlock: {
    gap: space.xxs,
  },
});

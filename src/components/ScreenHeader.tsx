import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { makeStyles } from '../theme/theme';
import { space } from '../theme/tokens';
import { AppText } from './AppText';
import { TopBar } from './TopBar';

type ScreenHeaderProps = {
  title: string;
  /** A short secondary line under the title: a date, a status. */
  subtitle?: string;
  onBack?: () => void;
  /** The back control's word: "Home", "Back to the cook". "Back" by default. */
  backLabel?: string;
  /** At most two actions on the right of the bar. */
  trailing?: ReactNode;
  /** Replaces the plain title with the caller's own title element (an inline editor, say). */
  titleSlot?: ReactNode;
  /** A small line above the title, e.g. a cook's meal type and cuisine. */
  eyebrow?: ReactNode;
  /** A line under the subtitle, e.g. "2nd time cooking this". */
  footnote?: ReactNode;
};

/**
 * The top of a screen reached from Home: the TopBar with back and its
 * actions, then the screen's own title below it, never squeezed into the bar.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  trailing,
  titleSlot,
  eyebrow,
  footnote,
}: ScreenHeaderProps) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <TopBar
        back={onBack ? { label: backLabel, onPress: onBack, accessibilityLabel: 'Back' } : undefined}
        actions={trailing}
      />
      <View style={styles.titleBlock}>
        {eyebrow ?? null}
        {titleSlot ?? (
          <AppText variant="title" accessibilityRole="header">
            {title}
          </AppText>
        )}
        {subtitle ? (
          <AppText variant="secondary" tone="inkMuted">
            {subtitle}
          </AppText>
        ) : null}
        {footnote ?? null}
      </View>
    </View>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    header: {
      gap: space.xs,
      marginBottom: space.md,
    },
    titleBlock: {
      gap: space.xxs,
    },
  }),
);

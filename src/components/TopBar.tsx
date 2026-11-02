import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { isTestBuild } from '../config/appIdentity';
import { makeStyles } from '../theme/theme';
import { radius, size, space } from '../theme/tokens';
import { touchSlop } from '../theme/touch';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { TestBadge } from './TestBadge';

type TopBarProps = {
  /** Home: the app's name in the app-title style, with the TEST badge on the Test build. */
  appTitle?: string;
  /** The inner screen draws the app's name a little smaller. */
  compact?: boolean;
  /** Elsewhere: a back control, "‹ Home" or "‹ Back to the cook". */
  back?: { label: string; onPress: () => void; accessibilityLabel?: string; testID?: string };
  /** A quiet word after the back control ("Review"). */
  context?: string;
  /** At most two actions on the right. */
  actions?: ReactNode;
};

/**
 * The top of every screen: the app's name or a back control on the left, at
 * most two actions on the right. No fill; it sits on the page. The screen's
 * own title goes below the bar, never squeezed into it.
 *
 * Nothing in it is squeezed (0.4.0, part 5). The back control keeps its words
 * on one line at their natural width; when it and the actions do not fit side
 * by side, the actions go onto the next line, and if they do not fit beside
 * each other there either, onto a line each. The app's name is the exception:
 * it wraps inside its own space, so Home's ⋯ stays on the first line.
 */
export function TopBar({ appTitle, compact = false, back, context, actions }: TopBarProps) {
  const styles = useStyles();
  return (
    <View style={styles.bar} testID="top-bar">
      <View style={appTitle ? styles.titleLeading : styles.leading} testID="top-bar-leading">
        {appTitle ? (
          <>
            <AppText variant={compact ? 'appTitleInner' : 'appTitle'} accessibilityRole="header">
              {appTitle}
            </AppText>
            {isTestBuild() ? <TestBadge /> : null}
          </>
        ) : null}
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={back.accessibilityLabel ?? back.label}
            onPress={back.onPress}
            testID={back.testID ?? 'screen-back'}
            hitSlop={BACK_SLOP}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <Icon name="chevronLeft" color="ink" size={size.icon - 2} />
            <AppText variant="bodyStrong" numberOfLines={1} style={styles.word}>
              {back.label}
            </AppText>
          </Pressable>
        ) : null}
        {context ? (
          <AppText variant="bodyStrong" tone="inkMuted">
            {context}
          </AppText>
        ) : null}
      </View>
      {actions ? (
        <View style={appTitle ? styles.titleActions : styles.actions} testID="top-bar-actions">
          {actions}
        </View>
      ) : null}
    </View>
  );
}

type IconButtonProps = {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  accessibilityState?: { expanded?: boolean };
  testID?: string;
};

/** A round icon control on surface-raised, with its accessibility label: ⋯, the filter button. */
export function IconButton({ icon, accessibilityLabel, onPress, accessibilityState, testID }: IconButtonProps) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      onPress={onPress}
      testID={testID}
      hitSlop={ICON_BUTTON_SLOP}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <Icon name={icon} color="ink" size={size.icon - 4} />
    </Pressable>
  );
}

/** Back is drawn 40 tall; its width comes from its word. The hit area makes 48. */
const BACK_SLOP = touchSlop(size.iconButton);
/** ⋯ and the like are drawn 40 round; the hit area makes 48 each way. */
const ICON_BUTTON_SLOP = touchSlop(size.iconButton, size.iconButton);

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.xs,
      minHeight: size.iconButton,
    },
    // A back control and its context word: their natural width, never less.
    leading: {
      flexGrow: 1,
      flexShrink: 0,
      flexBasis: 'auto',
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: space.xs,
    },
    // The app's name: takes what the ⋯ leaves, and wraps inside it.
    titleLeading: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: space.xs,
    },
    word: {
      flexShrink: 0,
    },
    back: {
      minHeight: size.iconButton,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xxs / 2,
      paddingRight: space.sm,
      borderRadius: radius.pill,
    },
    pressed: {
      opacity: 0.7,
    },
    // On the first line when they fit beside the back control; otherwise on
    // the next, where they may wrap again, one per line.
    actions: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 'auto',
      minWidth: 0,
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: space.xs,
    },
    titleActions: {
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    iconButton: {
      width: size.iconButton,
      height: size.iconButton,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }),
);

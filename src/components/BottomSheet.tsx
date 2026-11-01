import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { makeStyles } from '../theme/theme';
import { breakpoint, radius, size, space } from '../theme/tokens';
import { AppText } from './AppText';

type BottomSheetProps = {
  title: string;
  /** A tap on the scrim closes the sheet without changes. */
  onClose: () => void;
  children: ReactNode;
  /** The foot: Clear and the sheet's one main action, say. */
  foot?: ReactNode;
  /** Room for the system bars, from the host that shows the sheet. */
  bottomInset?: number;
  testID?: string;
};

/**
 * A panel that rises from the bottom over a scrim, for a focused choice: the
 * Filters sheet, adding a reading, a cook's actions. Sized to its content up
 * to 90 % of the screen; on the inner screen it is a centred sheet no wider
 * than the measure. The host (`PaneSheet`) handles Back.
 */
export function BottomSheet({ title, onClose, children, foot, bottomInset = 0, testID }: BottomSheetProps) {
  const styles = useStyles();
  const { width, height } = useWindowDimensions();
  const wide = width >= breakpoint.medium;
  return (
    <View style={[styles.root, wide && styles.rootWide]} testID={testID}>
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        testID={testID ? `${testID}-scrim` : undefined}
      >
        <View style={styles.scrim} />
      </Pressable>
      <View
        style={[
          styles.sheet,
          wide && styles.sheetWide,
          { maxHeight: height * 0.9, paddingBottom: bottomInset + space.md },
        ]}
      >
        <View style={styles.handle} />
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {children}
        </ScrollView>
        {foot ? <View style={styles.foot}>{foot}</View> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadows }) =>
  StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    rootWide: {
      alignItems: 'center',
    },
    scrim: {
      flex: 1,
      backgroundColor: colors.scrim,
    },
    sheet: {
      alignSelf: 'stretch',
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.zone,
      borderTopRightRadius: radius.zone,
      paddingHorizontal: space.md,
      paddingTop: space.xs,
      gap: space.sm,
      boxShadow: shadows.sheet,
    },
    sheetWide: {
      alignSelf: 'center',
      width: '100%',
      maxWidth: size.measure,
    },
    handle: {
      alignSelf: 'center',
      width: size.handleW,
      height: size.handleH,
      borderRadius: radius.pill,
      backgroundColor: colors.controlLine,
      marginBottom: space.xxs,
    },
    body: {
      flexGrow: 0,
    },
    bodyContent: {
      gap: space.md,
    },
    foot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.sm,
    },
  }),
);

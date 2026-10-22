import { StyleSheet, View } from 'react-native';

import type { ReadingTreatment } from '../theme/tokens';
import { readingTreatments } from '../theme/tokens';

type ReadingIconProps = {
  /** Which reading this icon stands for. There is one drawing for each. */
  kind: ReadingTreatment;
  testID?: string;
};

/**
 * The oven and probe marks on a reading card, drawn from plain views.
 *
 * No icon font and no SVG dependency: two small shapes are cheaper to draw than
 * to install, and the baseline loads no custom font. They are deliberately
 * simple — an oven is a box with a door and a handle, a probe is a stem with a
 * dial — because at 20 dp on a phone anything more is mud.
 *
 * Hidden from the screen reader on purpose. Every card prints the word "Oven"
 * or "Internal" next to the mark, so a reader that announced the drawing as
 * well would say it twice. The mark is decoration on top of the word, never a
 * replacement for it.
 */
export function ReadingIcon({ kind, testID }: ReadingIconProps) {
  const ink = readingTreatments[kind].ink;

  return (
    <View
      style={styles.frame}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      {kind === 'oven' ? (
        <View style={[styles.ovenBody, { borderColor: ink }]}>
          <View style={[styles.ovenDial, { backgroundColor: ink }]} />
          <View style={[styles.ovenDoor, { borderTopColor: ink }]}>
            <View style={[styles.ovenHandle, { backgroundColor: ink }]} />
          </View>
        </View>
      ) : (
        <View style={styles.probe}>
          <View style={[styles.probeDial, { borderColor: ink }]} />
          <View style={[styles.probeStem, { backgroundColor: ink }]} />
          <View style={[styles.probeTip, { borderTopColor: ink }]} />
        </View>
      )}
    </View>
  );
}

const SIZE = 22;

const styles = StyleSheet.create({
  frame: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ovenBody: {
    width: SIZE,
    height: SIZE - 2,
    borderWidth: 1.5,
    borderRadius: 4,
    overflow: 'hidden',
  },
  ovenDial: {
    width: 3,
    height: 3,
    borderRadius: 2,
    marginTop: 2,
    marginLeft: 3,
  },
  ovenDoor: {
    flex: 1,
    marginTop: 2,
    borderTopWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ovenHandle: {
    width: SIZE - 10,
    height: 1.5,
    borderRadius: 1,
  },
  probe: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
  },
  probeDial: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  probeStem: {
    width: 1.5,
    flex: 1,
    marginTop: 1,
  },
  // A flat triangle, made the way React Native makes triangles: a zero-width
  // box with one coloured border. It is the needle's point.
  probeTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 2.5,
    borderRightWidth: 2.5,
    borderTopWidth: 4,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});

import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '../components/ActionButton';
import { CoreLoop } from '../components/CoreLoop';
import { ScreenContainer } from '../components/ScreenContainer';
import { ShellHeader } from '../components/ShellHeader';
import {
  CORE_LOOP_INTRO,
  CORE_LOOP_SUMMARY,
  HISTORY_TITLE,
  MILESTONE_NOTE,
  NEW_COOK_TITLE,
  PRODUCT_TAGLINE,
} from '../content/product';
import { colors, fontSize, space } from '../theme/tokens';

type HomeScreenProps = {
  onNewCook: () => void;
  onHistory: () => void;
};

export function HomeScreen({ onNewCook, onHistory }: HomeScreenProps) {
  return (
    <ScreenContainer testID="home-screen">
      <ShellHeader />

      <Text style={styles.tagline}>{PRODUCT_TAGLINE}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{CORE_LOOP_INTRO}</Text>
        <CoreLoop />
        <Text style={styles.sectionBody}>{CORE_LOOP_SUMMARY}</Text>
      </View>

      <View style={styles.actions}>
        <ActionButton
          label={NEW_COOK_TITLE}
          hint="Start recording what happened in the kitchen"
          onPress={onNewCook}
          variant="primary"
        />
        <ActionButton
          label={HISTORY_TITLE}
          hint="Look back at what you have already cooked"
          onPress={onHistory}
          variant="secondary"
        />
      </View>

      <Text style={styles.footnote}>{MILESTONE_NOTE}</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tagline: {
    color: colors.text,
    fontSize: fontSize.bodyLarge,
    marginBottom: space.lg,
  },
  section: {
    gap: space.sm,
    marginBottom: space.xl,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
  sectionBody: {
    color: colors.textMuted,
    fontSize: fontSize.body,
  },
  actions: {
    gap: space.md,
    marginBottom: space.xl,
  },
  footnote: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    marginTop: 'auto',
  },
});

import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '../components/ActionButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { ShellHeader } from '../components/ShellHeader';
import { BACK_TO_HOME } from '../content/product';
import { colors, fontSize, radius, space } from '../theme/tokens';

export const NOT_IMPLEMENTED_LABEL = 'Not implemented yet';

type PlaceholderScreenProps = {
  title: string;
  body: string;
  onBack: () => void;
  testID?: string;
};

/**
 * A route that deliberately does not look functional: it states plainly that the
 * feature is absent and offers only a way back.
 */
export function PlaceholderScreen({ title, body, onBack, testID }: PlaceholderScreenProps) {
  return (
    <ScreenContainer testID={testID}>
      <ShellHeader subtitle={title} />

      <View style={styles.notice}>
        <Text style={styles.noticeLabel}>{NOT_IMPLEMENTED_LABEL}</Text>
        <Text style={styles.noticeBody}>{body}</Text>
      </View>

      <ActionButton label={BACK_TO_HOME} onPress={onBack} variant="secondary" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderColor: colors.border,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
    marginBottom: space.xl,
  },
  noticeLabel: {
    color: colors.text,
    fontSize: fontSize.body,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noticeBody: {
    color: colors.textMuted,
    fontSize: fontSize.body,
  },
});

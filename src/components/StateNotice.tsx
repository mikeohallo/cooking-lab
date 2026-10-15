import { StyleSheet, View } from 'react-native';

import { colors, radius, space } from '../theme/tokens';
import { ActionButton } from './ActionButton';
import { AppText } from './AppText';

type StateNoticeProps = {
  /** What happened, in one line. */
  title: string;
  /** Is the cook safe, and what can be done now. */
  body?: string;
  /** `info` for calm explanations, `problem` for a failure the person should act on. */
  tone?: 'info' | 'problem';
  /** One obvious action, if there is one. */
  action?: { label: string; onPress: () => void; pending?: boolean };
  testID?: string;
};

/**
 * Empty, unavailable and failure states, all in one shape, so every one of them
 * answers the baseline's three questions: what happened, is my cook safe, and
 * what can I do now.
 */
export function StateNotice({ title, body, tone = 'info', action, testID }: StateNoticeProps) {
  return (
    <View
      style={[styles.notice, tone === 'problem' ? styles.problem : styles.info]}
      accessibilityRole={tone === 'problem' ? 'alert' : undefined}
      testID={testID}
    >
      <AppText variant="bodyStrong">{title}</AppText>
      {body ? <AppText variant="secondary" tone="muted">{body}</AppText> : null}
      {action ? (
        <ActionButton
          label={action.label}
          onPress={action.onPress}
          variant="secondary"
          pending={action.pending}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space.md,
    gap: space.xs,
  },
  info: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.surfaceMuted,
  },
  problem: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerSoft,
  },
  action: {
    marginTop: space.xs,
    alignSelf: 'flex-start',
  },
});

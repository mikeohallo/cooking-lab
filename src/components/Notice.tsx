import { StyleSheet, View } from 'react-native';

import { makeStyles } from '../theme/theme';
import { radius, size, space } from '../theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

type NoticeProps = {
  /** What happened, in one line. */
  title: string;
  /** What to do next, in a sentence or two. */
  body?: string;
  /**
   * `info` for an empty list or a calm explanation, centred under a sage
   * circle; `problem` for something that went wrong, on danger-soft.
   */
  tone?: 'info' | 'problem';
  /** The icon in the sage circle, for an info notice. */
  icon?: IconName;
  /** At most one button, that does the next thing. */
  action?: { label: string; onPress: () => void; pending?: boolean };
  testID?: string;
};

/**
 * A short message in place of content: an empty list, nothing noted yet,
 * something that went wrong. Every one says what happened and what to do
 * next; an error never says "Something went wrong" alone.
 */
export function Notice({ title, body, tone = 'info', icon, action, testID }: NoticeProps) {
  const styles = useStyles();
  const problem = tone === 'problem';
  return (
    <View
      style={[styles.notice, problem ? styles.problem : styles.info]}
      accessibilityRole={problem ? 'alert' : undefined}
      testID={testID}
    >
      {!problem && icon ? (
        <View style={styles.circle}>
          <Icon name={icon} color="zoneIcon" />
        </View>
      ) : null}
      <AppText variant={problem ? 'bodyStrong' : 'heading'} style={problem ? null : styles.centred}>
        {title}
      </AppText>
      {body ? (
        <AppText variant="body" tone={problem ? 'ink' : 'inkMuted'} style={problem ? null : styles.centred}>
          {body}
        </AppText>
      ) : null}
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant="secondary"
          pending={action.pending}
          style={problem ? null : styles.centredSelf}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    notice: {
      gap: space.xs,
    },
    info: {
      paddingVertical: space.lg,
      paddingHorizontal: space.md,
    },
    problem: {
      backgroundColor: colors.dangerSoft,
      borderRadius: radius.card,
      padding: space.md,
    },
    circle: {
      alignSelf: 'center',
      width: size.iconCircle,
      height: size.iconCircle,
      borderRadius: radius.pill,
      backgroundColor: colors.zone,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space.xxs,
    },
    centred: {
      textAlign: 'center',
    },
    centredSelf: {
      alignSelf: 'center',
      marginTop: space.xs,
    },
  }),
);

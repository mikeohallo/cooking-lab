import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../components/AppText';
import { Icon } from '../components/Icon';
import { ScreenContainer } from '../components/ScreenContainer';
import { TopBar } from '../components/TopBar';
import { Notice } from '../components/Notice';
import { BACK_HOME, NAMES_STAY, RETRY, WHOS_EATING, WHOS_EATING_INTRO } from '../content/product';
import type { HouseholdMember } from '../domain/entities';
import { useStorage } from '../state/StorageProvider';
import { makeStyles } from '../theme/theme';
import { radius, size, space } from '../theme/tokens';
import { HouseholdEditor } from './record/HouseholdEditor';

type HouseholdScreenProps = {
  onBack: () => void;
};

/**
 * "Who's eating" (0.4.0), reached from Home's ⋯: the people who usually eat,
 * numbered in the order the review lists them, each with Rename and the bin,
 * then + Add someone. Kept on this phone and nowhere else, and it says so.
 */
export function HouseholdScreen({ onBack }: HouseholdScreenProps) {
  const styles = useStyles();
  const { data } = useStorage();
  const [members, setMembers] = useState<readonly HouseholdMember[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    data.household
      .list()
      .then((list) => {
        if (live) {
          setMembers(list);
          setProblem(null);
        }
      })
      .catch((cause: unknown) => {
        if (live) {
          setProblem(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      live = false;
    };
  }, [data, attempt]);

  return (
    <ScreenContainer testID="household-screen">
      <View style={styles.header}>
        <TopBar back={{ label: BACK_HOME, onPress: onBack, accessibilityLabel: 'Back' }} />
        <View style={styles.titleRow}>
          <View style={styles.circle}>
            <Icon name="people" color="zoneIcon" />
          </View>
          <AppText variant="title" accessibilityRole="header" style={styles.title}>
            {WHOS_EATING}
          </AppText>
        </View>
        <AppText variant="body" tone="inkMuted">
          {WHOS_EATING_INTRO}
        </AppText>
      </View>
      {problem ? (
        <Notice
          title="The list could not be loaded"
          body={`Nothing was changed. ${problem}`}
          tone="problem"
          action={{ label: RETRY, onPress: () => setAttempt((n) => n + 1) }}
        />
      ) : null}
      {members !== null ? <HouseholdEditor members={members} onChanged={setMembers} /> : null}
      <View style={styles.privacy}>
        <Icon name="lock" color="inkMuted" size={size.iconSmall + 2} />
        <AppText variant="secondary" tone="inkMuted" style={styles.title}>
          {NAMES_STAY}
        </AppText>
      </View>
    </ScreenContainer>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    header: {
      gap: space.sm,
      marginBottom: space.md,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    circle: {
      width: size.avatar,
      height: size.avatar,
      borderRadius: radius.pill,
      backgroundColor: colors.zone,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
    },
    privacy: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
      marginTop: space.xl,
    },
  }),
);

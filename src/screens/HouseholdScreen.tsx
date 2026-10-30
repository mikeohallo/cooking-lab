import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { AppText } from '../components/AppText';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateNotice } from '../components/StateNotice';
import { RETRY, WHOS_EATING, WHO_USUALLY_EATS_BODY } from '../content/product';
import type { HouseholdMember } from '../domain/entities';
import { useStorage } from '../state/StorageProvider';
import { space } from '../theme/tokens';
import { HouseholdEditor } from './record/HouseholdEditor';

type HouseholdScreenProps = {
  onBack: () => void;
};

/**
 * "Who's eating" (0.3.0), reached from Home: the people who usually eat, in
 * the order the review lists them. Kept on this phone and nowhere else.
 */
export function HouseholdScreen({ onBack }: HouseholdScreenProps) {
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
      <ScreenHeader title={WHOS_EATING} onBack={onBack} />
      <AppText variant="secondary" tone="muted" style={styles.intro}>
        {WHO_USUALLY_EATS_BODY}
      </AppText>
      {problem ? (
        <StateNotice
          title="The list could not be loaded"
          body={`Nothing was changed. ${problem}`}
          tone="problem"
          action={{ label: RETRY, onPress: () => setAttempt((n) => n + 1) }}
        />
      ) : null}
      {members !== null ? <HouseholdEditor members={members} onChanged={setMembers} /> : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginBottom: space.md,
  },
});

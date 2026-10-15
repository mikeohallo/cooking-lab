import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '../components/AppText';
import { ScreenContainer } from '../components/ScreenContainer';
import { ShellHeader } from '../components/ShellHeader';
import { StateNotice } from '../components/StateNotice';
import { STARTING_TITLE } from '../content/product';
import { colors, space } from '../theme/tokens';
import { useStorageState, type StorageState } from './StorageProvider';

type StartupGateProps = {
  children: ReactNode;
};

/**
 * Keeps the screens from rendering until the store has opened, and shows a
 * clear, safe state when it could not — never an apparently empty Home.
 *
 * `recovery_required` in particular is not an error to retry: the data is
 * there and encrypted, the key is missing, and the person needs to know that
 * rather than be shown a notebook with nothing in it.
 */
export function StartupGate({ children }: StartupGateProps) {
  const state = useStorageState();

  if (state.status === 'ready') {
    return <>{children}</>;
  }

  if (state.status === 'starting') {
    return (
      <ScreenContainer testID="startup-starting">
        <ShellHeader />
        <View style={styles.starting}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="secondary" tone="muted">
            {STARTING_TITLE}
          </AppText>
        </View>
      </ScreenContainer>
    );
  }

  const { title, body } = describeFailure(state);
  return (
    <ScreenContainer testID="startup-failed">
      <ShellHeader />
      <StateNotice title={title} body={body} tone="problem" testID="startup-failure-notice" />
    </ScreenContainer>
  );
}

function describeFailure(state: Extract<StorageState, { status: 'failed' }>): {
  title: string;
  body: string;
} {
  switch (state.reason) {
    case 'recovery_required':
      return {
        title: 'Your notebook is locked',
        body: 'The cooking history on this device is still here and still encrypted, but the key that reads it is missing. Nothing has been changed or deleted. Restoring from a portable backup will be possible in a later version.',
      };
    case 'key_unavailable':
      return {
        title: 'The secure store could not be reached',
        body: 'Cooking Lab keeps its key in the device’s secure store and could not open it. Nothing has been changed. Restarting the phone usually resolves this.',
      };
    case 'database_unreadable':
      return {
        title: 'The notebook could not be read',
        body: 'The file is present but did not open with its key. Nothing has been changed or deleted.',
      };
    case 'schema_from_a_later_build':
      return {
        title: 'This notebook was written by a newer Cooking Lab',
        body: 'The data is intact and has not been touched. Install the newer version of the app to open it.',
      };
    case 'migration_failed':
    case 'schema_incomplete':
      return {
        title: 'The notebook could not be updated',
        body: `The update was rolled back and your history is unchanged. ${state.message}`,
      };
    case 'unexpected':
      return {
        title: 'Cooking Lab could not open its notebook',
        body: `Nothing has been changed. ${state.message}`,
      };
    default:
      return {
        title: 'Cooking Lab could not open its notebook',
        body: `Nothing has been changed. ${state.message}`,
      };
  }
}

const styles = StyleSheet.create({
  starting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
});

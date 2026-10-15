import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { StartupGate } from '../src/app/StartupGate';
import { StorageProvider } from '../src/app/StorageProvider';
import { newDeviceId } from '../src/data/native/expoCrypto';
import { initialiseStorage } from '../src/data/startup';
import { colors } from '../src/theme/tokens';

/**
 * Opens the encrypted store once at launch and gates every screen behind the
 * outcome, so a store that could not open is explained rather than shown as
 * an empty notebook.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <StorageProvider start={initialiseStorage} newId={newDeviceId}>
        <StartupGate>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
        </StartupGate>
      </StorageProvider>
    </SafeAreaProvider>
  );
}

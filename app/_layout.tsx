import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PendingDeletionProvider } from '../src/state/PendingDeletion';
import { StartupGate } from '../src/state/StartupGate';
import { StorageProvider } from '../src/state/StorageProvider';
import { newDeviceId } from '../src/data/native/expoCrypto';
import type { StorageStartupResult } from '../src/data/runtime';
import { describeStartup, initialiseStorage } from '../src/data/startup';
import { colors } from '../src/theme/tokens';

/**
 * One line in the device log per launch — `created` on a fresh install,
 * `opened` on every launch after — is the evidence a native build is read
 * from. It names the schema version and nothing about the key.
 */
function logStartup(result: StorageStartupResult): void {
  console.log(describeStartup(result));
}

/** Every screen waits, inside its own route, for the store to open. */
function gated({ children }: { children: ReactNode }) {
  return <StartupGate>{children}</StartupGate>;
}

/**
 * The navigator is mounted from the first frame and never swapped out, so the
 * router can match the launch URL the moment it has one. The encrypted store
 * opens once, and each screen shows the starting or failure state in place
 * until it has — never an apparently empty Home.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <StorageProvider start={initialiseStorage} newId={newDeviceId} onStarted={logStartup}>
        {/* Above every screen, so "Cook deleted · Undo" shows wherever the cook lands. */}
        <PendingDeletionProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
            screenLayout={gated}
          />
        </PendingDeletionProvider>
      </StorageProvider>
    </SafeAreaProvider>
  );
}

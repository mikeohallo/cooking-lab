import { Stack } from 'expo-router';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { KeepPlace } from '../src/layout/KeepPlace';
import { FontGate } from '../src/state/FontGate';
import { PendingDeletionProvider } from '../src/state/PendingDeletion';
import { StartupGate } from '../src/state/StartupGate';
import { StorageProvider } from '../src/state/StorageProvider';
import { newDeviceId } from '../src/data/native/expoCrypto';
import type { StorageStartupResult } from '../src/data/runtime';
import { describeStartup, initialiseStorage } from '../src/data/startup';
import { useTheme } from '../src/theme/theme';

/**
 * One line in the device log per launch — `created` on a fresh install,
 * `opened` on every launch after — is the evidence a native build is read
 * from. It names the schema version and nothing about the key.
 */
function logStartup(result: StorageStartupResult): void {
  console.log(describeStartup(result));
}

/**
 * Every screen waits, inside its own route, for the bundled fonts (a moment
 * at most, and only the first time) and for the store to open. Inside the
 * route rather than around the navigator, which stays mounted from the first
 * frame so the router can match the launch URL.
 */
function gated({ children }: { children: ReactNode }) {
  return (
    <FontGate>
      <StartupGate>{children}</StartupGate>
    </FontGate>
  );
}

/**
 * The navigator is mounted from the first frame and never swapped out, so the
 * router can match the launch URL the moment it has one. The encrypted store
 * opens once, and each screen shows the starting or failure state in place
 * until it has — never an apparently empty Home.
 */
function AppLayout() {
  // Light or dark follows the phone, live; the system bars' icons follow it
  // too, dark on the light page and light on the dark one.
  const { name, colors } = useTheme();
  const bars = name === 'dark' ? 'light' : 'dark';
  return (
    <SafeAreaProvider>
      <StatusBar style={bars} />
      <NavigationBar style={name === 'dark' ? 'dark' : 'light'} />
      <StorageProvider start={initialiseStorage} newId={newDeviceId} onStarted={logStartup}>
        {/* Above every screen, so "Cook deleted · Undo" shows wherever the cook lands. */}
        <PendingDeletionProvider>
          {/* Your place, through a live font-size or display-size change (0.4.1). */}
          <KeepPlace />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.page },
            }}
            screenLayout={gated}
          />
        </PendingDeletionProvider>
      </StorageProvider>
    </SafeAreaProvider>
  );
}

/**
 * The web preview's shell (`src/preview/`, 0.4.0 part 7), in a browser only.
 * `Platform.OS` is a constant in each bundle, so Metro drops this require,
 * and everything under it, from an Android bundle;
 * `__tests__/previewNotInAndroid.test.ts` holds it to that.
 */
const PreviewShell: ((props: { children: ReactNode }) => ReactNode) | null =
  Platform.OS === 'web'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../src/preview/PreviewShell.web').PreviewShell
    : null;

export default function RootLayout() {
  return PreviewShell === null ? <AppLayout /> : <PreviewShell><AppLayout /></PreviewShell>;
}

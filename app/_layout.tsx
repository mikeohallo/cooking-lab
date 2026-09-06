import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { describeStartup, initialiseStorage } from '../src/data/startup';
import { colors } from '../src/theme/tokens';

export default function RootLayout() {
  // Open the encrypted store once, at launch. Nothing on screen depends on it
  // yet — reading and writing a cook is the M2 workflow — but the key, the
  // migrations and the recovery check all happen here, and a build that has
  // never opened its own database has not been tested.
  useEffect(() => {
    let live = true;
    initialiseStorage()
      .then((result) => {
        if (live) {
          console.log(describeStartup(result));
        }
      })
      .catch((cause: unknown) => {
        console.log(
          `Cooking Lab storage did not open: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </SafeAreaProvider>
  );
}

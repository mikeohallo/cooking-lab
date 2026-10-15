import { useLocalSearchParams, usePathname, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { AppText } from '../src/components/AppText';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { ShellHeader } from '../src/components/ShellHeader';
import { StateNotice } from '../src/components/StateNotice';
import { BACK_TO_HOME } from '../src/content/product';

/**
 * Shown when the router is asked for a path it has no screen for.
 *
 * It says which path, on screen and in the device log, so a wrong turn can be
 * diagnosed from a photo of the phone — and it offers a way back that is known
 * to work. Nothing here touches the store.
 */
export default function NotFoundRoute() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const params = useLocalSearchParams();

  useEffect(() => {
    console.log(
      `Cooking Lab router: no screen for ${JSON.stringify({ pathname, segments, params })}`,
    );
  }, [pathname, segments, params]);

  return (
    <ScreenContainer testID="not-found-screen">
      <ShellHeader />
      <StateNotice
        title="There is no screen at this address"
        body="Nothing has been changed. Go back to Home to carry on."
        tone="problem"
        action={{ label: BACK_TO_HOME, onPress: () => router.replace('/') }}
      />
      <AppText variant="caption" tone="muted" testID="not-found-path">
        {`Asked for: ${pathname} · segments: ${JSON.stringify(segments)}`}
      </AppText>
    </ScreenContainer>
  );
}

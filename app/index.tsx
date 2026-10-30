import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useFocusRefresh } from '../src/state/useFocusRefresh';
import type { CookId } from '../src/domain/entities';
import { HomeScreen } from '../src/screens/HomeScreen';

export default function HomeRoute() {
  const router = useRouter();
  const refreshToken = useFocusRefresh();

  const openCook = useCallback((cookId: CookId) => router.push(`/cook/${cookId}`), [router]);
  const goToHistory = useCallback(() => router.push('/history'), [router]);
  const goToHousehold = useCallback(() => router.push('/household'), [router]);

  return (
    <HomeScreen
      onOpenCook={openCook}
      onHistory={goToHistory}
      onHousehold={goToHousehold}
      refreshToken={refreshToken}
    />
  );
}

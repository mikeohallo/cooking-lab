import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useFocusRefresh } from '../src/state/useFocusRefresh';
import type { CookId } from '../src/domain/entities';
import { HistoryScreen } from '../src/screens/HistoryScreen';

export default function HistoryRoute() {
  const router = useRouter();
  const refreshToken = useFocusRefresh();

  const openCook = useCallback((cookId: CookId) => router.push(`/cook/${cookId}`), [router]);
  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }, [router]);

  return <HistoryScreen onOpenCook={openCook} onBack={goBack} refreshToken={refreshToken} />;
}

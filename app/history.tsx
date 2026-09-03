import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { HISTORY_BODY, HISTORY_TITLE } from '../src/content/product';
import { PlaceholderScreen } from '../src/screens/PlaceholderScreen';

export default function HistoryRoute() {
  const router = useRouter();
  const goHome = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }, [router]);

  return (
    <PlaceholderScreen
      title={HISTORY_TITLE}
      body={HISTORY_BODY}
      onBack={goHome}
      testID="history-screen"
    />
  );
}

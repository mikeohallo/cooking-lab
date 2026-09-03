import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { NEW_COOK_BODY, NEW_COOK_TITLE } from '../src/content/product';
import { PlaceholderScreen } from '../src/screens/PlaceholderScreen';

export default function NewCookRoute() {
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
      title={NEW_COOK_TITLE}
      body={NEW_COOK_BODY}
      onBack={goHome}
      testID="new-cook-screen"
    />
  );
}

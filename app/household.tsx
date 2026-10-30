import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { HouseholdScreen } from '../src/screens/HouseholdScreen';

export default function HouseholdRoute() {
  const router = useRouter();
  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }, [router]);

  return <HouseholdScreen onBack={goBack} />;
}

import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { HomeScreen } from '../src/screens/HomeScreen';

export default function HomeRoute() {
  const router = useRouter();

  const goToNewCook = useCallback(() => router.push('/new-cook'), [router]);
  const goToHistory = useCallback(() => router.push('/history'), [router]);

  return <HomeScreen onNewCook={goToNewCook} onHistory={goToHistory} />;
}

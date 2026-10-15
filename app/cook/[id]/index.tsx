import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useFocusRefresh } from '../../../src/state/useFocusRefresh';
import { ScreenContainer } from '../../../src/components/ScreenContainer';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { StateNotice } from '../../../src/components/StateNotice';
import { BACK_TO_HOME, COOK_NOT_FOUND_BODY, COOK_NOT_FOUND_TITLE } from '../../../src/content/product';
import type { CookId } from '../../../src/domain/entities';
import { isEntityId } from '../../../src/domain/invariants';
import { CookScreen } from '../../../src/screens/CookScreen';

export default function CookRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const refreshToken = useFocusRefresh();

  const goHome = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }, [router]);
  const goToReview = useCallback((cookId: CookId) => router.push(`/cook/${cookId}/review`), [router]);

  if (!isEntityId(id)) {
    return (
      <ScreenContainer testID="cook-bad-link">
        <ScreenHeader title={COOK_NOT_FOUND_TITLE} onBack={goHome} />
        <StateNotice
          title={COOK_NOT_FOUND_TITLE}
          body={COOK_NOT_FOUND_BODY}
          tone="problem"
          action={{ label: BACK_TO_HOME, onPress: goHome }}
        />
      </ScreenContainer>
    );
  }

  return <CookScreen cookId={id} onBack={goHome} onReview={goToReview} refreshToken={refreshToken} />;
}

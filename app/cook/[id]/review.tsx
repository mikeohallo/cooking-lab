import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { ScreenContainer } from '../../../src/components/ScreenContainer';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { StateNotice } from '../../../src/components/StateNotice';
import { BACK_TO_HOME, COOK_NOT_FOUND_BODY, COOK_NOT_FOUND_TITLE } from '../../../src/content/product';
import type { CookId } from '../../../src/domain/entities';
import { isEntityId } from '../../../src/domain/invariants';
import { ReviewScreen } from '../../../src/screens/ReviewScreen';

export default function ReviewRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }, [router]);

  // Once reviewed, the cook is shown read-only. Pop back to Home and open the
  // detail from there, so Back from the detail goes home instead of returning
  // to a finished review or the editable cook.
  const onFinished = useCallback(
    (cookId: CookId) => {
      router.dismissTo('/');
      router.push(`/cook/${cookId}`);
    },
    [router],
  );

  if (!isEntityId(id)) {
    return (
      <ScreenContainer testID="review-bad-link">
        <ScreenHeader title={COOK_NOT_FOUND_TITLE} onBack={goBack} />
        <StateNotice
          title={COOK_NOT_FOUND_TITLE}
          body={COOK_NOT_FOUND_BODY}
          tone="problem"
          action={{ label: BACK_TO_HOME, onPress: goBack }}
        />
      </ScreenContainer>
    );
  }

  return <ReviewScreen cookId={id} onBack={goBack} onFinished={onFinished} />;
}

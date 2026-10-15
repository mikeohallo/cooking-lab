import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

/**
 * A number that changes each time the route regains focus after the first.
 *
 * Screens stay mounted in the navigation stack, so Home does not remount when
 * the person comes back from a cook. Passing this token to a screen's loaders
 * is what makes it reload what it shows.
 */
export function useFocusRefresh(): number {
  const [token, setToken] = useState(0);
  const first = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      setToken((value) => value + 1);
    }, []),
  );

  return token;
}

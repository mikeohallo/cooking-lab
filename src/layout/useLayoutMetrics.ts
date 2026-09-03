import { useWindowDimensions } from 'react-native';

import { computeLayoutMetrics, type LayoutMetrics } from './responsive';

/**
 * Live layout metrics. Recomputes when the window changes, which is what makes
 * the shell react to folding, unfolding, rotation and multi-window.
 */
export function useLayoutMetrics(): LayoutMetrics {
  const { width } = useWindowDimensions();
  return computeLayoutMetrics(width);
}

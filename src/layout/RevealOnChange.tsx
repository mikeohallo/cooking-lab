import { useEffect, useRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useScreenScroll } from './ScreenScroll';

type RevealOnChangeProps = {
  /**
   * Scrolls this block to the top of its pane whenever the token changes —
   * not when it first appears. Home bumps it on Previous and Next, so a new
   * page starts with the search box in view (0.3.0).
   */
  token: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function RevealOnChange({ token, children, style, testID }: RevealOnChangeProps) {
  const ref = useRef<View>(null);
  const { reveal } = useScreenScroll();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    reveal(ref.current);
  }, [token, reveal]);

  return (
    <View ref={ref} style={style} testID={testID}>
      {children}
    </View>
  );
}

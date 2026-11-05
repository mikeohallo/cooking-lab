/**
 * Home's lists end with room for the dock's fade (0.4.1).
 *
 * The soft fade above the docked New Cook is drawn over the end of the list.
 * A list with a dock now ends with the usual margin and the fade's height
 * besides, so its last control — No matches' Clear filters, the pager — is
 * never under the fade. A screen with no dock ends as before.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DOCK_FADE_HEIGHT, ScreenContainer } from '../src/components/ScreenContainer';
import { space } from '../src/theme/tokens';
import { TEST_SAFE_AREA } from './support/screens';

const endOf = () =>
  StyleSheet.flatten(screen.getByTestId('screen-scroll').props.contentContainerStyle) as { paddingBottom?: number };

describe('the end of a list', () => {
  it('leaves the usual margin and the fade’s height when there is a dock', async () => {
    await render(
      <SafeAreaProvider initialMetrics={TEST_SAFE_AREA}>
        <ScreenContainer dock={<Text>New Cook</Text>}>
          <Text>List</Text>
        </ScreenContainer>
      </SafeAreaProvider>,
    );
    const fade = StyleSheet.flatten(screen.getByTestId('screen-dock-fade').props.style) as { height: number; top: number };
    expect(fade.height).toBe(DOCK_FADE_HEIGHT);
    expect(fade.top).toBe(-DOCK_FADE_HEIGHT);
    expect(endOf().paddingBottom).toBe(space.ml + DOCK_FADE_HEIGHT);
    // The fade covers no more than that room.
    expect(endOf().paddingBottom! - fade.height).toBeGreaterThanOrEqual(space.ml);
  });

  it('ends with the usual margin when there is no dock', async () => {
    await render(
      <SafeAreaProvider initialMetrics={TEST_SAFE_AREA}>
        <ScreenContainer>
          <Text>List</Text>
        </ScreenContainer>
      </SafeAreaProvider>,
    );
    expect(endOf().paddingBottom ?? space.ml).toBe(space.ml);
    expect(screen.queryByTestId('screen-dock-fade')).toBeNull();
  });
});

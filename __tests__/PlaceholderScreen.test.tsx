import { fireEvent, render, screen } from '@testing-library/react-native';

import { BACK_TO_HOME, HISTORY_BODY, NEW_COOK_BODY } from '../src/content/product';
import {
  NOT_IMPLEMENTED_LABEL,
  PlaceholderScreen,
} from '../src/screens/PlaceholderScreen';

describe('PlaceholderScreen', () => {
  it('states plainly that New Cook is not implemented in Milestone 0', async () => {
    await render(
      <PlaceholderScreen
        title="New Cook"
        body={NEW_COOK_BODY}
        onBack={jest.fn()}
        testID="new-cook-screen"
      />,
    );

    expect(screen.getByTestId('new-cook-screen')).toBeOnTheScreen();
    expect(screen.getByText(NOT_IMPLEMENTED_LABEL)).toBeOnTheScreen();
    expect(screen.getByText(NEW_COOK_BODY)).toBeOnTheScreen();
  });

  it('states plainly that History has no persistence yet', async () => {
    await render(
      <PlaceholderScreen
        title="History"
        body={HISTORY_BODY}
        onBack={jest.fn()}
        testID="history-screen"
      />,
    );

    expect(screen.getByText(HISTORY_BODY)).toBeOnTheScreen();
  });

  it('always offers a way back', async () => {
    const onBack = jest.fn();
    await render(
      <PlaceholderScreen title="History" body={HISTORY_BODY} onBack={onBack} />,
    );

    await fireEvent.press(screen.getByRole('button', { name: BACK_TO_HOME }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

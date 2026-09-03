import { fireEvent, render, screen } from '@testing-library/react-native';

import { TEST_BADGE_TEST_ID } from '../src/components/TestBadge';
import {
  CORE_LOOP_STEPS,
  HISTORY_TITLE,
  MILESTONE_NOTE,
  NEW_COOK_TITLE,
  PRODUCT_TAGLINE,
} from '../src/content/product';
import { HomeScreen } from '../src/screens/HomeScreen';

async function renderHome() {
  const onNewCook = jest.fn();
  const onHistory = jest.fn();
  await render(<HomeScreen onNewCook={onNewCook} onHistory={onHistory} />);
  return { onNewCook, onHistory };
}

describe('HomeScreen', () => {
  it('renders the Cooking Lab shell', async () => {
    await renderHome();
    expect(screen.getByTestId('home-screen')).toBeOnTheScreen();
  });

  it('speaks Cooking Lab product language rather than template copy', async () => {
    await renderHome();
    expect(screen.getByText(PRODUCT_TAGLINE)).toBeOnTheScreen();
    expect(screen.getByText(MILESTONE_NOTE)).toBeOnTheScreen();
  });

  it('presents the full core loop', async () => {
    await renderHome();
    expect(screen.getByTestId('core-loop')).toBeOnTheScreen();
    for (const step of CORE_LOOP_STEPS) {
      expect(screen.getByText(step)).toBeOnTheScreen();
    }
  });

  it('offers New Cook and History as buttons', async () => {
    await renderHome();
    expect(screen.getByRole('button', { name: NEW_COOK_TITLE })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: HISTORY_TITLE })).toBeOnTheScreen();
  });

  it('navigates from the two primary controls', async () => {
    const { onNewCook, onHistory } = await renderHome();

    await fireEvent.press(screen.getByRole('button', { name: NEW_COOK_TITLE }));
    expect(onNewCook).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('button', { name: HISTORY_TITLE }));
    expect(onHistory).toHaveBeenCalledTimes(1);
  });

  it('shows no TEST indicator under the default production identity', async () => {
    await renderHome();
    expect(screen.queryByTestId(TEST_BADGE_TEST_ID)).toBeNull();
    expect(screen.getByText('Cooking Lab')).toBeOnTheScreen();
  });
});

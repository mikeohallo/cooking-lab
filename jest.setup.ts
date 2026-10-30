// Registers the React Native Testing Library jest matchers, which the import
// itself does, and sets the one global it needs.
import { configure } from '@testing-library/react-native';

/**
 * How long a `findBy*` query or a `waitFor` may wait.
 *
 * The default is one second, which is generous on this desktop and not on the
 * GitHub runner: a screen test there renders a real component tree, writes
 * through real services to real SQLite, and reads the row back, and a second is
 * not always enough for one round of that under forty-odd suites running at
 * once on four cores. Three of these tests failed on CI and passed everywhere
 * else, which is a budget being too small and not a test being wrong.
 *
 * Deliberately a budget and not a retry: the queries still wait for the same
 * thing and fail if it never arrives. What changes is how long "never" takes to
 * establish on a slow machine.
 */
configure({ asyncUtilTimeout: 5_000 });

/**
 * The window every screen test sees, unless a test says otherwise: as wide as
 * the Fold's cover display (about 369 dp).
 *
 * React Native's test window is 750 dp wide, which since 0.3.0 counts as the
 * unfolded inner display and gives a screen two panes. Most tests are about
 * one column, the cover display, so that is the default; a test of two panes
 * mocks this module itself with the inner display's figures.
 */
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => {
  const actual = jest.requireActual('react-native/Libraries/Utilities/useWindowDimensions');
  return {
    __esModule: true,
    default: () => ({ ...actual.default(), width: 369 }),
  };
});

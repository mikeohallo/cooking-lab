/**
 * The TEST variant must be unmistakable inside the running application, not only
 * in the launcher. `expo-constants` is mocked so both identities can be
 * exercised without producing two native builds.
 */
import { render, screen } from '@testing-library/react-native';

import { ShellHeader } from '../src/components/ShellHeader';
import { TEST_BADGE_TEST_ID } from '../src/components/TestBadge';
import { getAppVariant } from '../src/config/appIdentity';
import { TEST_BUILD_NOTICE } from '../src/content/product';

type MockExtra = { appVariant?: unknown };

const mockConstants: { expoConfig: { extra: MockExtra } | null } = {
  expoConfig: { extra: {} },
};

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockConstants.expoConfig;
    },
  },
}));

function setManifestVariant(value: unknown) {
  mockConstants.expoConfig = { extra: { appVariant: value } };
}

describe('TEST build identity', () => {
  afterEach(() => {
    mockConstants.expoConfig = { extra: {} };
  });

  it('shows the TEST name, badge and notice on the test variant', async () => {
    setManifestVariant('test');
    await render(<ShellHeader />);

    expect(getAppVariant()).toBe('test');
    expect(screen.getByText('Cooking Lab Test')).toBeOnTheScreen();
    expect(screen.getByTestId(TEST_BADGE_TEST_ID)).toBeOnTheScreen();
    expect(screen.getByText(TEST_BUILD_NOTICE)).toBeOnTheScreen();
  });

  it('shows no TEST affordance on the production variant', async () => {
    setManifestVariant('production');
    await render(<ShellHeader />);

    expect(getAppVariant()).toBe('production');
    expect(screen.getByText('Cooking Lab')).toBeOnTheScreen();
    expect(screen.queryByTestId(TEST_BADGE_TEST_ID)).toBeNull();
    expect(screen.queryByText(TEST_BUILD_NOTICE)).toBeNull();
  });

  it('falls back to production when the manifest carries no variant', async () => {
    setManifestVariant(undefined);
    await render(<ShellHeader />);

    expect(getAppVariant()).toBe('production');
    expect(screen.queryByTestId(TEST_BADGE_TEST_ID)).toBeNull();
  });

  it('falls back to production for an unrecognised manifest value', async () => {
    setManifestVariant('staging');
    await render(<ShellHeader />);

    expect(getAppVariant()).toBe('production');
    expect(screen.queryByTestId(TEST_BADGE_TEST_ID)).toBeNull();
  });

  it('falls back to production when there is no manifest at all', async () => {
    mockConstants.expoConfig = null;
    await render(<ShellHeader />);

    expect(getAppVariant()).toBe('production');
    expect(screen.queryByTestId(TEST_BADGE_TEST_ID)).toBeNull();
  });
});

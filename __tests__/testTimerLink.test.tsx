/**
 * The TEST-only timer link (0.5.0 fixes): cookinglab://test-timer starts a
 * named timer of an exact length for the scripted device test. It checks
 * every parameter, and in the production app it only goes Home.
 */
import { render } from '@testing-library/react-native';

const mockConstants: { expoConfig: { extra: { appVariant?: unknown } } | null } = {
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

const mockRedirects: string[] = [];
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    mockRedirects.push(href);
    return null;
  },
  useLocalSearchParams: () => {
    throw new Error('the production route must not read its parameters');
  },
  useRouter: () => {
    throw new Error('the production route must not use the router');
  },
}));

// eslint-disable-next-line import/first
import TestTimerRoute, { readTestTimerLink } from '../app/test-timer';

describe('the TEST-only timer link', () => {
  afterEach(() => {
    mockConstants.expoConfig = { extra: {} };
    mockRedirects.length = 0;
  });

  it('reads a cook id, a name and a whole number of seconds', () => {
    expect(readTestTimerLink({ cook: 'script-cook-1', name: ' Meat ', seconds: '60' })).toEqual({
      action: 'start',
      cook: 'script-cook-1',
      title: null,
      name: 'Meat',
      seconds: 60,
    });
    expect(readTestTimerLink({ cook: 'c1', title: 'Script cook', name: 'Rest', seconds: '8801' })).toMatchObject({
      title: 'Script cook',
      seconds: 8801,
    });
  });

  it('reads stop=all for one cook, and nothing else as a stop', () => {
    expect(readTestTimerLink({ cook: 'c1', stop: 'all' })).toEqual({ action: 'stop', cook: 'c1' });
    expect(readTestTimerLink({ cook: 'c1', stop: 'yes' })).toHaveProperty('problem');
    expect(readTestTimerLink({ cook: 'Bad Id', stop: 'all' })).toHaveProperty('problem');
  });

  it('refuses a bad id, an empty or long name, and seconds that are not 1 to a day', () => {
    expect(readTestTimerLink({ cook: 'Bad Id', name: 'Meat', seconds: '60' })).toHaveProperty('problem');
    expect(readTestTimerLink({ cook: 'c1', name: '  ', seconds: '60' })).toHaveProperty('problem');
    expect(readTestTimerLink({ cook: 'c1', name: 'x'.repeat(41), seconds: '60' })).toHaveProperty('problem');
    for (const seconds of ['0', '1.5', '86401', 'abc', undefined]) {
      expect(readTestTimerLink({ cook: 'c1', name: 'Meat', seconds })).toHaveProperty('problem');
    }
  });

  it('in the production app goes Home without reading the link or the notebook', async () => {
    mockConstants.expoConfig = { extra: { appVariant: 'production' } };
    await render(<TestTimerRoute />);
    expect(mockRedirects).toEqual(['/']);
  });
});

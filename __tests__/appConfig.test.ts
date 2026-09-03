import appConfig from '../app.config';
import { APP_VARIANTS, resolveAppVariant } from '../src/config/variants';

type Ctx = Parameters<typeof appConfig>[0];

const emptyContext = { config: {} } as unknown as Ctx;

describe('app.config.ts', () => {
  const originalVariant = process.env.APP_VARIANT;

  afterEach(() => {
    if (originalVariant === undefined) {
      delete process.env.APP_VARIANT;
    } else {
      process.env.APP_VARIANT = originalVariant;
    }
  });

  it('produces the production identity by default', () => {
    delete process.env.APP_VARIANT;
    const config = appConfig(emptyContext);

    expect(config.name).toBe('Cooking Lab');
    expect(config.android?.package).toBe('com.cookinglab.personal');
    expect(config.extra?.appVariant).toBe('production');
  });

  it('produces the test identity when APP_VARIANT=test', () => {
    process.env.APP_VARIANT = 'test';
    const config = appConfig(emptyContext);

    expect(config.name).toBe('Cooking Lab Test');
    expect(config.android?.package).toBe('com.cookinglab.personal.test');
    expect(config.extra?.appVariant).toBe('test');
  });

  it('registers expo-router and targets Android only for the pilot', () => {
    delete process.env.APP_VARIANT;
    const config = appConfig(emptyContext);

    expect(config.plugins).toContain('expo-router');
    expect(config.plugins).toContain('expo-status-bar');
    expect(config.platforms).toEqual(['android']);
  });

  it('agrees with the runtime variant resolver for every input', () => {
    const inputs = [undefined, '', '  ', 'test', 'TEST', ' Test ', 'production', 'PRODUCTION'];

    for (const raw of inputs) {
      if (raw === undefined) {
        delete process.env.APP_VARIANT;
      } else {
        process.env.APP_VARIANT = raw;
      }

      const expected = APP_VARIANTS[resolveAppVariant(raw)];
      const config = appConfig(emptyContext);

      expect(config.name).toBe(expected.name);
      expect(config.android?.package).toBe(expected.androidPackage);
    }
  });

  it('refuses an unrecognised variant instead of falling back to production', () => {
    process.env.APP_VARIANT = 'staging';
    expect(() => appConfig(emptyContext)).toThrow(/Unknown APP_VARIANT/);
    expect(() => resolveAppVariant('staging')).toThrow(/Unknown APP_VARIANT/);
  });

  it('declares no Android permissions', () => {
    delete process.env.APP_VARIANT;
    const config = appConfig(emptyContext);

    expect(config.android?.permissions).toBeUndefined();
  });
});

/**
 * The folder the release build reads routes from is `app/`, and stays that way.
 *
 * Expo decides the routes folder at bundle time, and it silently prefers
 * `src/app` over `app` whenever a `src/app` folder exists. The first slice-1
 * TEST build had one (it held the storage provider and hooks), so the phone's
 * router was handed hooks instead of screens, found no Home, and opened on
 * "Unmatched Route". Screen and route tests did not catch it because they name
 * `app/` explicitly. These tests ask the same question the build asks, with the
 * build's own function.
 */
import fs from 'node:fs';
import path from 'node:path';

import appConfig from '../app.config';

type Ctx = Parameters<typeof appConfig>[0];

const PROJECT_ROOT = path.join(__dirname, '..');

/** Expo CLI's own routes-folder resolver — the function the release bundle uses. */
function expoRouterRootFor(exp: ReturnType<typeof appConfig>): string {
  const expoDir = path.dirname(require.resolve('expo/package.json'));
  const routerModule = require.resolve('@expo/cli/build/src/start/server/metro/router', {
    paths: [expoDir],
  });
  // A runtime path into Expo CLI's internals, so it cannot be a static import.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getRouterDirectoryModuleIdWithManifest } = require(routerModule) as {
    getRouterDirectoryModuleIdWithManifest: (root: string, exp: unknown) => string;
  };
  return getRouterDirectoryModuleIdWithManifest(PROJECT_ROOT, exp);
}

describe('routes folder', () => {
  it('pins app/ in the Expo config', () => {
    for (const variant of ['production', 'test']) {
      process.env.APP_VARIANT = variant;
      const config = appConfig({ config: {} } as unknown as Ctx);
      expect((config.extra as { router?: { root?: string } }).router?.root).toBe('app');
    }
    delete process.env.APP_VARIANT;
  });

  it('resolves to app/ through Expo’s own resolver, as the release build does', () => {
    delete process.env.APP_VARIANT;
    const resolved = expoRouterRootFor(appConfig({ config: {} } as unknown as Ctx));
    expect(path.resolve(PROJECT_ROOT, resolved)).toBe(path.join(PROJECT_ROOT, 'app'));
  });

  it('has no src/app folder for Expo to prefer', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'src', 'app'))).toBe(false);
  });

  it('keeps the Home route where the router looks for it', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'app', 'index.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'app', '_layout.tsx'))).toBe(true);
  });
});

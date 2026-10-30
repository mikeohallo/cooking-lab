/**
 * What the installed app will ask Android for.
 *
 * A permission on the app's listing is a claim about what the app does, and
 * Cooking Lab's whole proposition is that the claim is true. Nothing in the
 * repository checked this before: the permissions on the APK are the *merged*
 * manifest — this app's own, plus one from every native module in the tree,
 * minus whatever `blockedPermissions` strips — and no file in the repository
 * says what that adds up to. So a module added for one reason could quietly
 * bring three permissions with it, and the first anybody would know is the
 * install screen on the phone.
 *
 * This test does the merge. It reads the permissions every installed native
 * module declares, applies the app's own configuration, and states the answer
 * as a list. Adding a module that wants something new turns it red.
 *
 * WHAT IT CANNOT DO
 * -----------------
 * It is not Gradle. It models the one rule of manifest merging that matters
 * here — a `uses-permission` is in the merged manifest unless something removes
 * it — and it reads the modules' manifest files rather than their compiled
 * AARs, so a permission declared inside a prebuilt AAR (`expo-secure-store`'s
 * biometric pair, historically) is invisible to it. Those are blocked anyway,
 * and the block is asserted below, so the list this produces is the *most* the
 * APK can hold and not necessarily the least.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import appConfig from '../app.config';

type Ctx = Parameters<typeof appConfig>[0];
const emptyContext = { config: {} } as unknown as Ctx;

const REPO_ROOT = join(__dirname, '..');
const NODE_MODULES = join(REPO_ROOT, 'node_modules');

/** `android.permission.CAMERA` and friends, wherever they appear in a manifest. */
const PERMISSION = /android\.permission\.[A-Z_]+/g;

/**
 * Every native module's own `AndroidManifest.xml`.
 *
 * Walks the top level of `node_modules` and one level into each scope, which is
 * where an Expo or React Native module keeps its Android project.
 */
function moduleManifests(): readonly { readonly module: string; readonly path: string }[] {
  const found: { module: string; path: string }[] = [];

  const consider = (module: string, directory: string): void => {
    const manifest = join(directory, 'android', 'src', 'main', 'AndroidManifest.xml');
    if (existsSync(manifest)) {
      found.push({ module, path: manifest });
    }
  };

  for (const entry of readdirSync(NODE_MODULES)) {
    const directory = join(NODE_MODULES, entry);
    if (!statSync(directory).isDirectory()) {
      continue;
    }
    if (entry.startsWith('@')) {
      for (const scoped of readdirSync(directory)) {
        consider(`${entry}/${scoped}`, join(directory, scoped));
      }
      continue;
    }
    consider(entry, directory);
  }

  return found;
}

/** Everything any installed module declares, with who declares it. */
function declaredByModules(): ReadonlyMap<string, readonly string[]> {
  const byPermission = new Map<string, string[]>();

  for (const { module, path } of moduleManifests()) {
    const text = readFileSync(path, 'utf8');
    for (const permission of new Set(text.match(PERMISSION) ?? [])) {
      const modules = byPermission.get(permission) ?? [];
      modules.push(module);
      byPermission.set(permission, modules);
    }
  }

  return byPermission;
}

/** The app's own configuration, for the production identity. */
function androidConfig() {
  delete process.env.APP_VARIANT;
  const config = appConfig(emptyContext);
  return {
    blocked: (config.android?.blockedPermissions ?? []) as readonly string[],
    requested: (config.android?.permissions ?? undefined) as readonly string[] | undefined,
    plugins: (config.plugins ?? []) as readonly unknown[],
  };
}

describe('the permissions the APK will carry', () => {
  const declared = declaredByModules();
  const { blocked, requested, plugins } = androidConfig();

  it('found the module manifests it claims to be reading', () => {
    // Guards against the whole file passing because the walk found nothing.
    expect(declared.size).toBeGreaterThan(0);
    expect([...declared.keys()]).toContain('android.permission.CAMERA');
  });

  it('is INTERNET and CAMERA, and nothing else', () => {
    const merged = [...declared.keys()]
      .filter((permission) => !blocked.includes(permission))
      .sort();

    expect(merged).toEqual(['android.permission.CAMERA', 'android.permission.INTERNET']);
  });

  it('gains nothing from keeping the screen on (0.2.2)', () => {
    // `expo-keep-awake` sets the window's keep-screen-on flag, which needs no
    // permission; a wake lock would, and the module does not take one. If a
    // later version ever declared one, the line above would fail first.
    expect(moduleManifests().some((entry) => entry.module === 'expo-keep-awake')).toBe(true);
    for (const modules of declared.values()) {
      expect(modules).not.toContain('expo-keep-awake');
    }
    expect([...declared.keys()].filter((p) => !blocked.includes(p))).not.toContain(
      'android.permission.WAKE_LOCK',
    );
  });

  it('asks for the camera because the app takes photographs', () => {
    // Declared by the module that needs it rather than added by hand here,
    // which is the honest place for it.
    expect(declared.get('android.permission.CAMERA')).toEqual(['expo-image-picker']);
  });

  it('declares no permissions of its own at all', () => {
    expect(requested).toBeUndefined();
  });

  it('keeps every permission slice 2 blocked', () => {
    for (const permission of [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.VIBRATE',
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
    ]) {
      expect(blocked).toContain(permission);
    }
  });

  it('blocks the three the photo picker brought with it', () => {
    // A picture is chosen through Android's own photo picker, which runs
    // outside this app and hands over the one file the person chose — so there
    // is no photo library for this app to be given access to. And nothing in
    // Cooking Lab records sound.
    for (const permission of [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.RECORD_AUDIO',
    ]) {
      expect(blocked).toContain(permission);
    }
  });

  it('blocks the media permissions a later picker might ask for', () => {
    for (const permission of [
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
    ]) {
      expect(blocked).toContain(permission);
    }
  });

  it('turns the microphone off at the plugin as well as blocking it', () => {
    // Refused twice over: the plugin never requests it, and the block removes
    // it if some future version does.
    const picker = plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker',
    ) as [string, Record<string, unknown>] | undefined;

    expect(picker).toBeDefined();
    expect(picker?.[1]).toEqual({ microphonePermission: false });
  });

  it('asks for nothing to do with location, contacts, the network state or the phone', () => {
    const merged = [...declared.keys()].filter((permission) => !blocked.includes(permission));

    for (const forbidden of [
      'LOCATION',
      'CONTACTS',
      'CALENDAR',
      'SMS',
      'CALL',
      'PHONE_STATE',
      'ACCOUNTS',
      'RECORD_AUDIO',
      'BLUETOOTH',
      'NOTIFICATION',
    ]) {
      expect(merged.filter((permission) => permission.includes(forbidden))).toEqual([]);
    }
  });
});

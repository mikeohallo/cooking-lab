/**
 * The APK carries the commit it was built from, so what is installed can be
 * read off the phone rather than inferred from the repo.
 */
import appConfig from '../app.config';
import { applyBuildCommit, COMMIT_PATTERN } from '../plugins/withBuildCommit';

const GENERATED = `android {
    defaultConfig {
        applicationId 'com.cookinglab.personal'
        versionCode 2
        versionName "0.1.0"
    }
}
`;

describe('applyBuildCommit', () => {
  it('stamps the commit into the version name and changes nothing else', () => {
    const stamped = applyBuildCommit(GENERATED, 'ec4781d');
    expect(stamped).toBe(GENERATED.replace('versionName "0.1.0"', 'versionName "0.1.0 (ec4781d)"'));
  });

  it('marks a build from a changed tree as dirty, on the artefact', () => {
    expect(applyBuildCommit(GENERATED, 'ec4781d-dirty')).toContain('versionName "0.1.0 (ec4781d-dirty)"');
  });

  it('does not stamp twice when prebuild runs again', () => {
    const once = applyBuildCommit(GENERATED, 'ec4781d');
    expect(applyBuildCommit(once, 'ec4781d')).toBe(once);
  });

  it('writes nothing into Gradle that is not a commit id', () => {
    for (const bad of ['', 'main', 'ec4781d"; evil()', 'EC4781D', 'abc', '../x']) {
      expect(() => applyBuildCommit(GENERATED, bad)).toThrow(/not a commit id/);
    }
  });

  it('refuses a build.gradle with no version name rather than guessing', () => {
    expect(() => applyBuildCommit('android { }', 'ec4781d')).toThrow(/no versionName/);
  });
});

describe('app.config.ts passes the current commit to the plugin', () => {
  it.each(['production', 'test'])('for the %s variant', (variant) => {
    const previous = process.env.APP_VARIANT;
    process.env.APP_VARIANT = variant;
    try {
      const config = appConfig({ config: {} } as never);
      const entry = (config.plugins ?? []).find(
        (plugin) => Array.isArray(plugin) && plugin[0] === './plugins/withBuildCommit',
      ) as [string, { commit: string }] | undefined;
      expect(entry).toBeDefined();
      expect(entry![1].commit).toMatch(COMMIT_PATTERN);
    } finally {
      if (previous === undefined) delete process.env.APP_VARIANT;
      else process.env.APP_VARIANT = previous;
    }
  });
});

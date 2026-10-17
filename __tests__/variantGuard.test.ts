/**
 * A native project prebuilt for one variant refuses to be built as the other,
 * so the APK can never carry the TEST package with production's screens (the
 * 16 October icon build) or the reverse.
 */
import appConfig from '../app.config';
import { applyVariantGuard, MARKER } from '../plugins/withVariantGuard';

const GENERATED = `apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"

react {
    autolinkLibrariesWithApp()
}

android {
    namespace 'com.cookinglab.personal.test'
    defaultConfig {
        applicationId 'com.cookinglab.personal.test'
        versionCode 3
        versionName "0.1.0"
    }
}
`;

describe('applyVariantGuard', () => {
  const guarded = applyVariantGuard(GENERATED, 'test');

  it('records the prebuilt variant just before the android block', () => {
    expect(guarded).toContain(MARKER);
    expect(guarded).toContain("def cookingLabPrebuiltVariant = 'test'");
    expect(guarded.indexOf(MARKER)).toBeLessThan(guarded.indexOf('android {'));
    expect(guarded.indexOf(MARKER)).toBeGreaterThan(guarded.indexOf('react {'));
  });

  it("stops Gradle when its APP_VARIANT differs, reading unset as production like app.config.ts", () => {
    expect(guarded).toContain(
      "def cookingLabGradleVariant = (System.getenv('APP_VARIANT') ?: '').trim().toLowerCase() ?: 'production'",
    );
    expect(guarded).toContain('if (cookingLabGradleVariant != cookingLabPrebuiltVariant) {');
    expect(guarded).toContain('throw new GradleException(');
    expect(guarded).toContain('Set the same APP_VARIANT for prebuild and Gradle');
  });

  it('keeps everything else exactly as generated', () => {
    expect(guarded.replace(/\/\/ cooking-lab: variant guard[\s\S]*?\n\}\n/, '')).toBe(GENERATED);
  });

  it('guards production builds too', () => {
    expect(applyVariantGuard(GENERATED, 'production')).toContain(
      "def cookingLabPrebuiltVariant = 'production'",
    );
  });

  it('does not insert twice when prebuild runs again', () => {
    expect(applyVariantGuard(guarded, 'test')).toBe(guarded);
    expect(guarded.split(MARKER)).toHaveLength(2);
  });

  it('refuses an unknown variant or an unrecognised file instead of guessing', () => {
    expect(() => applyVariantGuard(GENERATED, 'staging')).toThrow(/unknown variant/);
    expect(() => applyVariantGuard("apply plugin: 'x'\n", 'test')).toThrow(/no `android \{` block/);
  });
});

describe('app.config.ts passes the requested variant to the guard', () => {
  it.each(['production', 'test'])('for the %s variant', (variant) => {
    const previous = process.env.APP_VARIANT;
    process.env.APP_VARIANT = variant;
    try {
      const config = appConfig({ config: {} } as never);
      const entry = (config.plugins ?? []).find(
        (plugin) => Array.isArray(plugin) && plugin[0] === './plugins/withVariantGuard',
      ) as [string, { variant: string }] | undefined;
      expect(entry).toBeDefined();
      expect(entry![1].variant).toBe(variant);
      expect(config.extra?.appVariant).toBe(variant);
    } finally {
      if (previous === undefined) delete process.env.APP_VARIANT;
      else process.env.APP_VARIANT = previous;
    }
  });
});

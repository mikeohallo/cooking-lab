/**
 * The production signing rule, applied to the build.gradle Expo actually
 * generates (the signing and build-type section below is the SDK 57 template,
 * verbatim, as read from a real prebuild).
 */
import {
  applyReleaseSigning,
  MARKER,
  REQUIRED_PROPERTIES,
} from '../plugins/withReleaseSigning';

const GENERATED = `android {
    ndkVersion rootProject.ext.ndkVersion
    namespace 'com.cookinglab.personal'
    defaultConfig {
        applicationId 'com.cookinglab.personal'
        versionCode 1
        versionName "0.1.0"
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
            minifyEnabled enableMinifyInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
        }
    }
    packagingOptions {
        jniLibs {
            useLegacyPackaging false
        }
    }
}
`;

describe('applyReleaseSigning', () => {
  const signed = applyReleaseSigning(GENERATED, 'production');

  it('leaves the TEST variant on the debug key, untouched', () => {
    expect(applyReleaseSigning(GENERATED, 'test')).toBe(GENERATED);
  });

  it('adds a release signing config that reads the four machine-local properties', () => {
    expect(signed).toContain(MARKER);
    expect(signed).toMatch(/signingConfigs \{[\s\S]*debug \{[\s\S]*\}[\s\S]*release \{[\s\S]*storeFile file\(COOKING_LAB_STORE_FILE\)/);
    for (const name of REQUIRED_PROPERTIES) {
      expect(signed).toContain(`project.hasProperty('${name}')`);
    }
    expect(signed).toContain('storePassword COOKING_LAB_STORE_PASSWORD');
    expect(signed).toContain('keyAlias COOKING_LAB_KEY_ALIAS');
    expect(signed).toContain('keyPassword COOKING_LAB_KEY_PASSWORD');
  });

  it('points the release build type at the release key and nowhere else', () => {
    const releaseBuildType = signed.slice(signed.indexOf('buildTypes {'));
    expect(releaseBuildType).toContain('signingConfig signingConfigs.release');
    expect(releaseBuildType).not.toMatch(/release \{[\s\S]*?signingConfig signingConfigs\.debug/);
    // The debug build type keeps its debug key.
    expect(releaseBuildType).toMatch(/debug \{\s*signingConfig signingConfigs\.debug/);
  });

  it('fails a production build loudly when the properties are missing, rather than using the debug key', () => {
    expect(signed).toContain('Cooking Lab production signing is not set up on this machine');
    expect(signed).toContain('Production builds are never signed with the debug key');
    expect(signed).toContain('throw new GradleException');
  });

  it('keeps everything else in the file exactly as generated', () => {
    expect(signed).toContain("applicationId 'com.cookinglab.personal'");
    expect(signed).toContain('minifyEnabled enableMinifyInReleaseBuilds');
    expect(signed).toContain('useLegacyPackaging false');
    expect(signed).toContain("storeFile file('debug.keystore')");
  });

  it('is idempotent, so re-running prebuild does not stack the rule', () => {
    expect(applyReleaseSigning(signed, 'production')).toBe(signed);
    expect(signed.split(MARKER)).toHaveLength(2);
  });

  it('refuses a build.gradle it does not recognise instead of guessing', () => {
    expect(() => applyReleaseSigning('android { buildTypes { release { } } }', 'production')).toThrow(
      /must not be signed with the debug key/,
    );
  });

  it('never contains a key, a password or a path to one', () => {
    const text = signed.toLowerCase();
    // The only key file named is the template's throwaway debug one.
    expect(text.match(/[\w.-]+\.(jks|keystore)/g)).toEqual(['debug.keystore']);
    expect(text).not.toMatch(/users[\\/]|home[\\/]/);
    // The only literal password is the debug key's public 'android'.
    expect(text.match(/(store|key)password\s+'[^']*'/g)).toEqual(["storepassword 'android'", "keypassword 'android'"]);
  });
});

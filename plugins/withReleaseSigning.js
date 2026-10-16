/**
 * Production builds are signed with Cooking Lab's own key. TEST builds are
 * not touched.
 *
 * The native project is generated on every build (`expo prebuild --clean`),
 * so the signing rule cannot live in `android/`: it lives here and is
 * re-applied each time. It edits the generated `android/app/build.gradle` in
 * two places —
 *
 *   1. adds a `release` signing config that reads four Gradle properties
 *      (`COOKING_LAB_STORE_FILE`, `COOKING_LAB_STORE_PASSWORD`,
 *      `COOKING_LAB_KEY_ALIAS`, `COOKING_LAB_KEY_PASSWORD`), and
 *   2. points the release build type at it instead of the debug key.
 *
 * WHERE THE SECRETS ARE, AND ARE NOT
 * ----------------------------------
 * The four properties come from the building machine's own
 * `~/.gradle/gradle.properties`, which Gradle reads automatically and which is
 * outside the repository. Nothing in this file, or anywhere in the tree,
 * holds a path to the key, the password, or the key itself; `.gitignore`
 * refuses `*.jks` and `*.keystore` as a second line, and `check-secrets` as a
 * third.
 *
 * A production build on a machine without those properties FAILS, by design,
 * with a message saying what is missing. It never falls back to the debug key:
 * an app signed with the throwaway key everybody has is not the real app, and
 * a build that quietly produced one would be worse than no build.
 */

const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// cooking-lab: release signing (plugins/withReleaseSigning.js)';

const REQUIRED_PROPERTIES = [
  'COOKING_LAB_STORE_FILE',
  'COOKING_LAB_STORE_PASSWORD',
  'COOKING_LAB_KEY_ALIAS',
  'COOKING_LAB_KEY_PASSWORD',
];

const DEBUG_SIGNING_CONFIG = /signingConfigs\s*\{\s*debug\s*\{[^}]*\}\s*\}/;
const RELEASE_USES_DEBUG_KEY = /(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/;

/** The Gradle fragment that defines the release signing config. */
function releaseSigningConfig() {
  const checks = REQUIRED_PROPERTIES.map(
    (name) =>
      `            if (!project.hasProperty('${name}')) { missing.add('${name}') }`,
  ).join('\n');
  return [
    '        release {',
    `            ${MARKER}`,
    '            def missing = []',
    checks,
    '            if (!missing.isEmpty()) {',
    "                throw new GradleException(",
    "                    'Cooking Lab production signing is not set up on this machine. ' +",
    "                    'Missing in ~/.gradle/gradle.properties: ' + missing.join(', ') + '. ' +",
    "                    'Production builds are never signed with the debug key.')",
    '            }',
    '            storeFile file(COOKING_LAB_STORE_FILE)',
    '            storePassword COOKING_LAB_STORE_PASSWORD',
    '            keyAlias COOKING_LAB_KEY_ALIAS',
    '            keyPassword COOKING_LAB_KEY_PASSWORD',
    '        }',
  ].join('\n');
}

/**
 * Pure: the generated build.gradle in, the signed-for-production build.gradle
 * out. Any variant other than production is returned unchanged, and a file
 * that already carries the rule is returned unchanged, so the step can be
 * applied as often as the build runs.
 */
function applyReleaseSigning(buildGradle, variant) {
  if (variant !== 'production') {
    return buildGradle;
  }
  if (buildGradle.includes(MARKER)) {
    return buildGradle;
  }
  if (!DEBUG_SIGNING_CONFIG.test(buildGradle) || !RELEASE_USES_DEBUG_KEY.test(buildGradle)) {
    throw new Error(
      'withReleaseSigning: the generated android/app/build.gradle does not look like the ' +
        'Expo template this rule was written for (no debug signingConfig, or no release ' +
        'build type using it). Refusing to guess; a production build must not be signed ' +
        'with the debug key.',
    );
  }
  const withConfig = buildGradle.replace(
    DEBUG_SIGNING_CONFIG,
    (match) => `${match.replace(/\s*\}\s*$/, '')}\n${releaseSigningConfig()}\n    }`,
  );
  return withConfig.replace(RELEASE_USES_DEBUG_KEY, '$1signingConfig signingConfigs.release');
}

/** @type {import('expo/config-plugins').ConfigPlugin<{ variant: string }>} */
const withReleaseSigning = (config, { variant }) =>
  withAppBuildGradle(config, (gradleConfig) => {
    gradleConfig.modResults.contents = applyReleaseSigning(
      gradleConfig.modResults.contents,
      variant,
    );
    return gradleConfig;
  });

module.exports = withReleaseSigning;
module.exports.applyReleaseSigning = applyReleaseSigning;
module.exports.REQUIRED_PROPERTIES = REQUIRED_PROPERTIES;
module.exports.MARKER = MARKER;

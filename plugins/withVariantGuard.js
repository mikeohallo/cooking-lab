/**
 * A native project prebuilt for one variant refuses to be built as the other.
 *
 * WHY
 * ---
 * `APP_VARIANT` is read twice in an Android build: by `expo prebuild`, which
 * writes the package name, app name and icon into `android/`, and again by
 * Gradle, which evaluates `app.config.ts` while it bundles the JavaScript and
 * embeds the app config the screens read (`extra.appVariant`). Set it for the
 * first and not the second and you get a mixed build: the TEST package and
 * icon, running production's screens with no TEST badge or notice. That is
 * exactly what the 16 October icon build shipped (see
 * `build-control/slices/reports/2026-10-16-icons.md`, "Corrected").
 *
 * WHAT IT DOES
 * ------------
 * Prebuild records the variant it generated for at the top of
 * `android/app/build.gradle`. When Gradle later configures the project, it
 * compares that with the `APP_VARIANT` it was started with and stops the build,
 * naming both, if they differ. No guessing and no fallback: an unset
 * `APP_VARIANT` means production, the same rule `app.config.ts` uses.
 */

const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// cooking-lab: variant guard (plugins/withVariantGuard.js)';

const VARIANTS = ['production', 'test'];

/** The Gradle fragment, for a project prebuilt as `variant`. */
function guard(variant) {
  return [
    MARKER,
    `def cookingLabPrebuiltVariant = '${variant}'`,
    "def cookingLabGradleVariant = (System.getenv('APP_VARIANT') ?: '').trim().toLowerCase() ?: 'production'",
    'if (cookingLabGradleVariant != cookingLabPrebuiltVariant) {',
    '    throw new GradleException(',
    "        'Cooking Lab: android/ was prebuilt for APP_VARIANT=' + cookingLabPrebuiltVariant +",
    "        ' but Gradle is running with APP_VARIANT=' + cookingLabGradleVariant + '. ' +",
    "        'Set the same APP_VARIANT for prebuild and Gradle, or the APK mixes the two variants.')",
    '}',
    '',
  ].join('\n');
}

/**
 * Pure: generated build.gradle in, guarded build.gradle out. Inserted just
 * before the `android {` block so it runs before anything is built. Refuses an
 * unknown variant or a file with no `android {` block rather than guessing,
 * and does not insert twice.
 */
function applyVariantGuard(buildGradle, variant) {
  if (!VARIANTS.includes(variant)) {
    throw new Error(`withVariantGuard: unknown variant "${variant}"; refusing to write it into build.gradle.`);
  }
  if (buildGradle.includes(MARKER)) {
    return buildGradle;
  }
  const androidBlock = /^android \{/m;
  if (!androidBlock.test(buildGradle)) {
    throw new Error('withVariantGuard: no `android {` block in the generated build.gradle; refusing to guess.');
  }
  return buildGradle.replace(androidBlock, `${guard(variant)}android {`);
}

/** @type {import('expo/config-plugins').ConfigPlugin<{ variant: string }>} */
const withVariantGuard = (config, { variant }) =>
  withAppBuildGradle(config, (gradleConfig) => {
    gradleConfig.modResults.contents = applyVariantGuard(gradleConfig.modResults.contents, variant);
    return gradleConfig;
  });

module.exports = withVariantGuard;
module.exports.applyVariantGuard = applyVariantGuard;
module.exports.MARKER = MARKER;

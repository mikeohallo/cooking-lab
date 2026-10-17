/**
 * Stamps the commit a build came from into the APK's version name:
 * `0.1.0 (ec4781d)`, or `0.1.0 (ec4781d-dirty)` if the tree had changes.
 *
 * Why: the build gate in CLAUDE.md approves one commit by name, and this is
 * how anyone can read back which commit an installed app was built from —
 * `adb shell dumpsys package <package> | grep versionName` on the Fold, or
 * Settings → Apps → Cooking Lab on a phone nothing is plugged into. Same idea
 * as reading what's live from the deploy's version message rather than from
 * a tag in the repo: the evidence is on the artefact.
 *
 * The commit is worked out in `app.config.ts` (`git rev-parse` at prebuild,
 * which runs after the gate) and passed in here. This file only writes it.
 */

const { withAppBuildGradle } = require('expo/config-plugins');

/** A short commit id, optionally marked dirty, or the explicit fallback. */
const COMMIT_PATTERN = /^(?:[0-9a-f]{7,40}(?:-dirty)?|unknown)$/;

const VERSION_NAME = /versionName "([^"]*)"/;

/**
 * Pure: generated build.gradle in, stamped build.gradle out. Refuses a commit
 * that is not a plain commit id (nothing else is ever written into Gradle),
 * refuses a file with no versionName rather than guessing, and does not stamp
 * twice.
 */
function applyBuildCommit(buildGradle, commit) {
  if (!COMMIT_PATTERN.test(commit)) {
    throw new Error(`withBuildCommit: "${commit}" is not a commit id; refusing to write it into build.gradle.`);
  }
  const match = buildGradle.match(VERSION_NAME);
  if (!match) {
    throw new Error('withBuildCommit: no versionName in the generated build.gradle; refusing to guess.');
  }
  const current = match[1];
  if (/ \([^)]*\)$/.test(current)) {
    return buildGradle;
  }
  return buildGradle.replace(VERSION_NAME, `versionName "${current} (${commit})"`);
}

/** @type {import('expo/config-plugins').ConfigPlugin<{ commit: string }>} */
const withBuildCommit = (config, { commit }) =>
  withAppBuildGradle(config, (gradleConfig) => {
    gradleConfig.modResults.contents = applyBuildCommit(gradleConfig.modResults.contents, commit);
    return gradleConfig;
  });

module.exports = withBuildCommit;
module.exports.applyBuildCommit = applyBuildCommit;
module.exports.COMMIT_PATTERN = COMMIT_PATTERN;

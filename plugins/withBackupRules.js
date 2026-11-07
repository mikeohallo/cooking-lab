/**
 * Cooking Lab's own Android Auto Backup rules (0.5.0 fix).
 *
 * Why: expo-secure-store's rules, which the app used until 0.5.0, back up
 * every settings file except one named `SecureStore`. 0.5.0's timers keep
 * running timers (name and end time) in a small settings file of their own,
 * `cook_timers.xml`, so they can ring after a restart; under those rules it
 * went into Android's cloud backup and device transfer, and a restore could
 * bring back timers that no longer exist. The secure store's own exclusion
 * also names `SecureStore` without `.xml`, which may not match its file.
 *
 * So the app writes its own rules, for Android 11 and lower
 * (`fullBackupContent`) and Android 12 and higher (`dataExtractionRules`):
 * settings files are backed up as before, except the timers' store and the
 * secure store, by both spellings. Nothing else changes: the notebook's
 * database was never in the backup, and the portable Cooking Lab backup is
 * still the way to move a notebook. expo-secure-store is told not to set its
 * own (`configureAndroidBackup: false` in app.config.ts).
 */

const fs = require('node:fs');
const path = require('node:path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const BACKUP_RULES = 'cooking_lab_backup_rules';
const EXTRACTION_RULES = 'cooking_lab_data_extraction_rules';

/** Settings files that never leave the phone. */
const KEPT_ON_PHONE = ['cook_timers.xml', 'SecureStore.xml', 'SecureStore'];

function rules(indent) {
  return [
    `${indent}<include domain="sharedpref" path="."/>`,
    ...KEPT_ON_PHONE.map((file) => `${indent}<exclude domain="sharedpref" path="${file}"/>`),
  ].join('\n');
}

/** Pure: the two rules files' contents. */
function backupRulesXml() {
  return {
    [BACKUP_RULES]: [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<!-- Cooking Lab: Auto Backup for Android 11 and lower (plugins/withBackupRules.js). -->',
      '<full-backup-content>',
      rules('  '),
      '</full-backup-content>',
      '',
    ].join('\n'),
    [EXTRACTION_RULES]: [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<!-- Cooking Lab: Auto Backup for Android 12 and higher (plugins/withBackupRules.js). -->',
      '<data-extraction-rules>',
      '  <cloud-backup>',
      rules('    '),
      '  </cloud-backup>',
      '  <device-transfer>',
      rules('    '),
      '  </device-transfer>',
      '</data-extraction-rules>',
      '',
    ].join('\n'),
  };
}

function withBackupRules(config) {
  config = withAndroidManifest(config, (config) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    app.$['android:fullBackupContent'] = `@xml/${BACKUP_RULES}`;
    app.$['android:dataExtractionRules'] = `@xml/${EXTRACTION_RULES}`;
    return config;
  });
  return withDangerousMod(config, [
    'android',
    (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dir, { recursive: true });
      for (const [name, xml] of Object.entries(backupRulesXml())) {
        fs.writeFileSync(path.join(dir, `${name}.xml`), xml);
      }
      return config;
    },
  ]);
}

module.exports = withBackupRules;
module.exports.backupRulesXml = backupRulesXml;
module.exports.KEPT_ON_PHONE = KEPT_ON_PHONE;

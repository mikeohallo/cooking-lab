/**
 * Android Auto Backup (0.5.0 fix): the app's own rules leave out the timers'
 * store and the secure store, for Android 11 and lower and 12 and higher,
 * and app.config.ts uses them in place of expo-secure-store's.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { backupRulesXml, KEPT_ON_PHONE } = require('../plugins/withBackupRules');

describe('backup rules', () => {
  const xml: Record<string, string> = backupRulesXml();

  it('keeps the timers’ store and the secure store, by both spellings, on the phone', () => {
    expect(KEPT_ON_PHONE).toEqual(['cook_timers.xml', 'SecureStore.xml', 'SecureStore']);
  });

  it('excludes them from Android 11’s backup, and from Android 12’s cloud backup and device transfer', () => {
    const old = xml.cooking_lab_backup_rules ?? '';
    const extraction = xml.cooking_lab_data_extraction_rules ?? '';
    for (const file of KEPT_ON_PHONE) {
      const rule = `<exclude domain="sharedpref" path="${file}"/>`;
      expect(old.split(rule)).toHaveLength(2);
      expect(extraction.split(rule)).toHaveLength(3);
    }
    expect(extraction).toContain('<cloud-backup>');
    expect(extraction).toContain('<device-transfer>');
  });

  it('is used by app.config.ts, with expo-secure-store’s own rules turned off', () => {
    const config = readFileSync(join(__dirname, '..', 'app.config.ts'), 'utf8');
    expect(config).toContain("'./plugins/withBackupRules'");
    expect(config).toContain("['expo-secure-store', { configureAndroidBackup: false }]");
  });
});

/**
 * The device's secure store, and nothing else.
 *
 * `expo-secure-store` keeps a value in the platform's own protected storage —
 * on Android, encrypted under a key held in the hardware-backed keystore. The
 * one value Cooking Lab puts there is the database key, and the policy around
 * it is in `src/data/sqlite/keyProvider.ts`, not here.
 *
 * `requireAuthentication` is deliberately not set. It would put a biometric
 * prompt in front of the database on every launch, and the database is opened
 * before the first screen appears; the protection this app needs is that
 * another application cannot read the key, which is what the keystore already
 * provides.
 *
 * Nothing in this file logs a value.
 */

import * as SecureStore from 'expo-secure-store';

import type { SecureStorePort } from '../sqlite/keyProvider';

export const expoSecureStorePort: SecureStorePort = {
  async isAvailable(): Promise<boolean> {
    return SecureStore.isAvailableAsync();
  },

  async getItem(alias: string): Promise<string | null> {
    return SecureStore.getItemAsync(alias);
  },

  async setItem(alias: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(alias, value);
  },

  async deleteItem(alias: string): Promise<void> {
    await SecureStore.deleteItemAsync(alias);
  },
};

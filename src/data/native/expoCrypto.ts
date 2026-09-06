/**
 * The device's cryptographic primitives, and nothing else.
 *
 * Two of them, for two jobs:
 *
 *   Random bytes.  The database key is 32 bytes from the platform's own secure
 *   random source — `SecureRandom` on Android — and never from `Math.random`,
 *   a timestamp, a device identifier or anything else that can be guessed or
 *   reproduced.
 *
 *   SHA-256.  A photograph's digest, which is what makes a restore verifiable:
 *   a file that does not hash to its manifest entry is a corrupted file. The
 *   bytes are hashed and dropped; nothing here logs, stores or returns them.
 */

import * as Crypto from 'expo-crypto';

import type { DigestPort } from '../files/privateFileStore';
import type { RandomBytesPort } from '../sqlite/keyProvider';

/**
 * A device-generated identifier.
 *
 * `expo-crypto` rather than a `crypto` global: React Native does not provide
 * one, and a UUID is already the shape `isEntityId` accepts — lowercase,
 * hyphen-separated and generated here rather than anywhere else.
 */
export function newDeviceId(): string {
  return Crypto.randomUUID();
}

export const expoRandomBytesPort: RandomBytesPort = {
  async bytes(count: number): Promise<Uint8Array> {
    return Crypto.getRandomBytesAsync(count);
  },
};

/** Lowercase hex, one byte at a time, with no dependency on a Buffer. */
function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export const expoDigestPort: DigestPort = {
  async sha256Hex(bytes: Uint8Array): Promise<string> {
    // Copied into a buffer the native call is willing to take: a `Uint8Array`
    // may be backed by shared memory, which `digest` does not accept.
    const material = new Uint8Array(bytes.length);
    material.set(bytes);
    const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, material);
    return toHex(new Uint8Array(digest));
  },
};

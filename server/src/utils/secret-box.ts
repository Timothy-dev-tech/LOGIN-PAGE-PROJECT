import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Encrypts small secrets (the 2FA secret) before they go into the database, so a leaked
// database dump alone does not hand out working authenticator secrets.
//
// AES-256-GCM is "authenticated" encryption: besides hiding the data it detects any change to it.
// The "AAD" (extra authenticated data) is the owner's id. A ciphertext copied onto another
// user's record fails to decrypt, so encrypted secrets cannot be swapped between accounts.

const VERSION = 'v1';

export function encryptSecret(plain: Buffer, key: Buffer, aad: string): string {
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes');
  const iv = randomBytes(12); // a new random IV every time; GCM must never reuse one with the same key
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, data].map((part) => (typeof part === 'string' ? part : part.toString('base64url'))).join('.');
}

/** Throws if the key is wrong, the text was changed, or it belongs to a different `aad`. */
export function decryptSecret(payload: string, key: Buffer, aad: string): Buffer {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== VERSION || !iv || !tag || data === undefined) throw new Error('Unrecognised encrypted value');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]);
}
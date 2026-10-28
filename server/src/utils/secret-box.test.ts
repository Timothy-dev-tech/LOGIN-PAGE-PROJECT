import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './secret-box.js';

const key = randomBytes(32);
const secret = Buffer.from('12345678901234567890');

describe('secret box (AES-256-GCM)', () => {
  it('round-trips', () => {
    expect(decryptSecret(encryptSecret(secret, key, 'user-1'), key, 'user-1').equals(secret)).toBe(true);
  });
  it('never contains the plain secret and differs every time (random IV)', () => {
    const a = encryptSecret(secret, key, 'user-1');
    const b = encryptSecret(secret, key, 'user-1');
    expect(a).not.toBe(b);
    expect(a).not.toContain(secret.toString('base64'));
    expect(a.startsWith('v1.')).toBe(true);
  });
  it('fails with the wrong key', () => {
    expect(() => decryptSecret(encryptSecret(secret, key, 'u'), randomBytes(32), 'u')).toThrow();
  });
  it('fails if copied to another user (different AAD)', () => {
    expect(() => decryptSecret(encryptSecret(secret, key, 'user-1'), key, 'user-2')).toThrow();
  });
  it('fails if any part was tampered with', () => {
    const [version, iv, tag, data] = encryptSecret(secret, key, 'u').split('.') as [string, string, string, string];
    const flip = (text: string) => (text.startsWith('A') ? 'B' : 'A') + text.slice(1);
    for (const broken of [`${version}.${flip(iv)}.${tag}.${data}`, `${version}.${iv}.${flip(tag)}.${data}`, `${version}.${iv}.${tag}.${flip(data)}`]) {
      expect(() => decryptSecret(broken, key, 'u')).toThrow();
    }
  });
  it('refuses garbage and keys of the wrong size', () => {
    expect(() => decryptSecret('nonsense', key, 'u')).toThrow(/Unrecognised/);
    expect(() => decryptSecret('v2.a.b.c', key, 'u')).toThrow(/Unrecognised/);
    expect(() => encryptSecret(secret, randomBytes(16), 'u')).toThrow(/32 bytes/);
  });
});
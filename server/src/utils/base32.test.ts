import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode } from './base32.js';

describe('base32 (RFC 4648 test vectors)', () => {
  const vectors: [string, string][] = [
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ];
  it.each(vectors)('encodes %j as %s', (plain, encoded) => {
    expect(base32Encode(Buffer.from(plain))).toBe(encoded);
  });
  it.each(vectors)('decodes %s back to %j', (plain, encoded) => {
    expect(base32Decode(encoded).toString()).toBe(plain);
  });
  it('round-trips random bytes', () => {
    for (let length = 0; length < 40; length++) {
      const bytes = Buffer.from(Array.from({ length }, (_, i) => (i * 37 + length * 11) % 256));
      expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
    }
  });
  it('ignores case, spaces and padding when decoding', () => {
    expect(base32Decode('mzxw 6ytb oi======').toString()).toBe('foobar');
  });
  it('refuses characters outside the alphabet', () => {
    expect(() => base32Decode('MZXW1')).toThrow(/base32/);
  });
});
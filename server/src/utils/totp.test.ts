import { describe, expect, it } from 'vitest';
import { base32Decode } from './base32.js';
import { generateTotpSecret, hotp, otpauthUri, stepAt, totpAt, verifyTotp } from './totp.js';

// Official test values from the RFCs. If these pass, the algorithm is the real one.
describe('HOTP, RFC 4226 Appendix D', () => {
  const secret = Buffer.from('12345678901234567890');
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  it.each(expected.map((code, counter) => [counter, code] as const))('counter %i gives %s', (counter, code) => {
    expect(hotp(secret, counter)).toBe(code);
  });
});

describe('TOTP, RFC 6238 Appendix B (SHA-1, 8 digits)', () => {
  const secret = Buffer.from('12345678901234567890');
  const vectors: [number, string][] = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  it.each(vectors)('at %i seconds gives %s', (seconds, code) => {
    expect(totpAt(secret, seconds * 1000, { digits: 8 })).toBe(code);
  });
});

describe('verifyTotp', () => {
  const secret = Buffer.from('12345678901234567890');
  const at = 1_700_000_000_000;
  const now = totpAt(secret, at);

  it('accepts the current code and reports its step', () => {
    expect(verifyTotp(secret, now, at)).toEqual({ valid: true, step: stepAt(at) });
  });
  it('forgives one step of clock drift either way, but not two', () => {
    expect(verifyTotp(secret, totpAt(secret, at - 30_000), at)).toMatchObject({ valid: true, step: stepAt(at) - 1 });
    expect(verifyTotp(secret, totpAt(secret, at + 30_000), at)).toMatchObject({ valid: true, step: stepAt(at) + 1 });
    expect(verifyTotp(secret, totpAt(secret, at - 60_000), at).valid).toBe(false);
    expect(verifyTotp(secret, totpAt(secret, at + 60_000), at).valid).toBe(false);
  });
  it('ignores spaces in what was typed', () => {
    expect(verifyTotp(secret, `${now.slice(0, 3)} ${now.slice(3)}`, at).valid).toBe(true);
  });
  it('refuses wrong codes and anything that is not six digits', () => {
    const wrong = String((Number(now) + 1) % 1_000_000).padStart(6, '0');
    expect(verifyTotp(secret, wrong, at).valid).toBe(false);
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 34', '١٢٣٤٥٦']) {
      expect(verifyTotp(secret, bad, at).valid).toBe(false);
    }
  });
  it('a different secret gives different codes', () => {
    expect(verifyTotp(generateTotpSecret(), now, at).valid).toBe(false);
  });
});

describe('generateTotpSecret', () => {
  it('is 20 random bytes', () => {
    const a = generateTotpSecret();
    expect(a).toHaveLength(20);
    expect(a.equals(generateTotpSecret())).toBe(false);
  });
});

describe('otpauthUri', () => {
  it('builds the address an authenticator app expects', () => {
    const secret = Buffer.from('12345678901234567890');
    const uri = new URL(otpauthUri(secret, 'tim@example.com'));
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.host).toBe('totp');
    expect(decodeURIComponent(uri.pathname)).toBe('/TimSol:tim@example.com');
    expect(uri.searchParams.get('issuer')).toBe('TimSol');
    expect(uri.searchParams.get('digits')).toBe('6');
    expect(uri.searchParams.get('period')).toBe('30');
    expect(base32Decode(uri.searchParams.get('secret')!).equals(secret)).toBe(true);
  });
  it('escapes awkward characters in the email', () => {
    const uri = otpauthUri(Buffer.alloc(20), 'a+b&c@example.com');
    expect(new URL(uri).searchParams.get('secret')).toBeTruthy();
    expect(uri).toContain('a%2Bb%26c%40example.com');
  });
});
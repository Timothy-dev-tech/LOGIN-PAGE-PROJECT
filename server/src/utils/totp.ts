import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { base32Encode } from './base32.js';

// Time-based one-time passwords, RFC 6238 (built on the counter-based HOTP of RFC 4226).
// Written with Node's built-in crypto so there is nothing hidden: every line is explainable,
// and the tests check it against the official test vectors from the RFC.

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept the code for the current step and one step either side, to forgive small clock drift. */
export const TOTP_WINDOW = 1;

export interface TotpOptions {
  digits?: number;
  period?: number;
}

/** RFC 4226: HMAC the counter, then "dynamic truncation" to a few digits. */
export function hotp(secret: Buffer, counter: number, digits: number = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter)); // 8 bytes, big-endian
  const hmac = createHmac('sha1', secret).update(message).digest();
  const offset = hmac[19]! & 0x0f; // the last nibble picks where to read
  const binary =
    ((hmac[offset]! & 0x7f) << 24) | // top bit cleared so the number is never negative
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** Which 30-second slot a moment falls in. */
export function stepAt(timeMs: number, period: number = TOTP_PERIOD_SECONDS): number {
  return Math.floor(timeMs / 1000 / period);
}

export function totpAt(secret: Buffer, timeMs: number, options: TotpOptions = {}): string {
  const { digits = TOTP_DIGITS, period = TOTP_PERIOD_SECONDS } = options;
  return hotp(secret, stepAt(timeMs, period), digits);
}

/** 20 random bytes (160 bits), the size RFC 4226 recommends for SHA-1. */
export function generateTotpSecret(): Buffer {
  return randomBytes(20);
}

export type TotpCheck = { valid: true; step: number } | { valid: false };

/**
 * Checks a code the person typed. Returns the step it matched so the caller can refuse to
 * accept the same step twice (a code is single-use even though it stays valid for ~30 seconds).
 */
export function verifyTotp(
  secret: Buffer,
  input: string,
  timeMs: number = Date.now(),
  window: number = TOTP_WINDOW,
): TotpCheck {
  const code = input.replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return { valid: false };
  const given = Buffer.from(code);
  const current = stepAt(timeMs);
  let matched: number | null = null;
  // Check every step in the window (no early exit) and compare in constant time.
  for (let offset = -window; offset <= window; offset++) {
    const step = current + offset;
    if (step < 0) continue;
    const expected = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(given, expected)) matched = step;
  }
  return matched === null ? { valid: false } : { valid: true, step: matched };
}

/** The address an authenticator app reads from the QR code. */
export function otpauthUri(secret: Buffer, accountEmail: string, issuer = 'TimSol'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountEmail)}`;
  const params = new URLSearchParams({
    secret: base32Encode(secret),
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
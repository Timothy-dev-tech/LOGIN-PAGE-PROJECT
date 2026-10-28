import { createHash, randomInt } from 'node:crypto';

// One-time codes for when the phone is lost. Each is 10 characters from an alphabet without
// look-alikes (no i, l, o, 0 or 1), shown as "abcde-fghij". 31 symbols ^ 10 is about 50 bits,
// far too many to guess, and each code works once.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 10;
export const RECOVERY_CODE_COUNT = 10;

export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
}

/** Lower-cases and removes spaces and dashes. Returns null if it cannot be a recovery code. */
export function normalizeRecoveryCode(input: string): string | null {
  const code = input.toLowerCase().replace(/[\s-]/g, '');
  if (code.length !== CODE_LENGTH) return null;
  for (const char of code) if (!ALPHABET.includes(char)) return null;
  return code;
}

/**
 * Only the hash is stored. A fast hash (SHA-256) is fine here, unlike for passwords: the codes
 * are random with ~50 bits of entropy, so there is nothing for a slow hash to protect against.
 */
export function hashRecoveryCode(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex');
}
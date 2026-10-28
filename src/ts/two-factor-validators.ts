// Rules for the second-factor inputs. Pure functions, no DOM. The server checks everything again;
// these only save a round trip and give a friendlier message.
import type { ValidationResult } from './validators';

export type FactorMode = 'app' | 'recovery';

const ok = (): ValidationResult => ({ valid: true });
const fail = (message: string): ValidationResult => ({ valid: false, message });

/** What the person typed, tidied: "123 456" -> "123456". */
export const tidyAppCode = (value: string): string => value.replace(/\s/g, '');

/** "ABCDE-fghjk" -> "abcdefghjk". */
export const tidyRecoveryCode = (value: string): string => value.toLowerCase().replace(/[\s-]/g, '');

export function validateAppCode(value: string): ValidationResult {
  const code = tidyAppCode(value);
  if (code === '') return fail('Enter the 6-digit code from your app');
  if (!/^\d{6}$/.test(code)) return fail('The code is 6 digits');
  return ok();
}

export function validateRecoveryCode(value: string): ValidationResult {
  const code = tidyRecoveryCode(value);
  if (code === '') return fail('Enter one of your recovery codes');
  if (!/^[a-z0-9]{10}$/.test(code)) return fail('A recovery code looks like abcde-fghjk');
  return ok();
}

export const validateFactor = (value: string, mode: FactorMode): ValidationResult =>
  mode === 'app' ? validateAppCode(value) : validateRecoveryCode(value);

/** The part of the request body that carries the second factor. */
export function factorBody(value: string, mode: FactorMode): { code: string } | { recoveryCode: string } {
  return mode === 'app' ? { code: tidyAppCode(value) } : { recoveryCode: tidyRecoveryCode(value) };
}

/** Recovery codes are shown as "abcde-fghjk"; the secret as groups of four so it is easy to type. */
export const groupSecret = (secret: string): string => secret.replace(/(.{4})(?=.)/g, '$1 ');
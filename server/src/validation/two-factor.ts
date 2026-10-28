import { asObject, failIfAny, text } from './helpers.js';

/** What a person can type to prove the second factor: an app code OR a recovery code. */
export interface SecondFactorInput {
  code?: string;
  recoveryCode?: string;
}

function parseSecondFactorFields(data: Record<string, unknown>, errors: Record<string, string>): SecondFactorInput {
  const code = text(data.code);
  const recovery = text(data.recoveryCode);
  const hasCode = code !== null && code.trim() !== '';
  const hasRecovery = recovery !== null && recovery.trim() !== '';
  if (hasCode === hasRecovery) {
    errors.code = 'Enter a code from your authenticator app, or a recovery code';
    return {};
  }
  return hasCode ? { code: code!.trim() } : { recoveryCode: recovery!.trim() };
}

function parsePassword(data: Record<string, unknown>, errors: Record<string, string>): string {
  const password = text(data.password);
  if (password === null || password === '') errors.password = 'Password is required';
  return password ?? '';
}

export function parsePasswordOnly(body: unknown): { password: string } {
  const errors: Record<string, string> = {};
  const password = parsePassword(asObject(body), errors);
  failIfAny(errors);
  return { password };
}

export function parseCodeOnly(body: unknown): { code: string } {
  const errors: Record<string, string> = {};
  const code = text(asObject(body).code);
  if (code === null || code.trim() === '') errors.code = 'Enter the 6-digit code from your app';
  failIfAny(errors);
  return { code: code!.trim() };
}

export function parsePasswordAndFactor(body: unknown): { password: string } & SecondFactorInput {
  const data = asObject(body);
  const errors: Record<string, string> = {};
  const password = parsePassword(data, errors);
  const factor = parseSecondFactorFields(data, errors);
  failIfAny(errors);
  return { password, ...factor };
}

export function parseVerifyInput(body: unknown): { challengeToken: string } & SecondFactorInput {
  const data = asObject(body);
  const errors: Record<string, string> = {};
  const challengeToken = text(data.challengeToken);
  if (challengeToken === null || challengeToken === '') errors.challengeToken = 'challengeToken is required';
  const factor = parseSecondFactorFields(data, errors);
  failIfAny(errors);
  return { challengeToken: challengeToken!, ...factor };
}
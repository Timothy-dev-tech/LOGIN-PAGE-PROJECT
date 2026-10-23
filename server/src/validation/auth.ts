import { HttpError } from '../utils/http-error.js';
import {
  normalizeEmail,
  normalizeName,
  validateEmail,
  validateName,
  validatePassword,
  type ValidationResult,
} from './validators.js';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
  remember: boolean;
}

/** JSON can hold anything, so check the type before the rules. */
function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function check(
  errors: Record<string, string>,
  field: string,
  value: unknown,
  rule: (v: string) => ValidationResult,
): string {
  const str = text(value);
  if (str === null) {
    errors[field] = `${field} must be text`;
    return '';
  }
  const result = rule(str);
  if (!result.valid) errors[field] = result.message;
  return str;
}

function failIfAny(errors: Record<string, string>): void {
  if (Object.keys(errors).length > 0) {
    throw new HttpError(400, 'validation_failed', 'Please fix the highlighted fields.', {
      fieldErrors: errors,
    });
  }
}

function asObject(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

export function parseRegisterInput(body: unknown): RegisterInput {
  const data = asObject(body);
  const errors: Record<string, string> = {};
  const name = check(errors, 'name', data.name, validateName);
  const email = check(errors, 'email', data.email, validateEmail);
  const password = check(errors, 'password', data.password, validatePassword);
  if (data.termsAccepted !== true) errors.termsAccepted = 'You must agree to continue';
  failIfAny(errors);
  // Note: role is never read from the request. See the User model.
  return { name: normalizeName(name), email: normalizeEmail(email), password };
}

export function parseLoginInput(body: unknown): LoginInput {
  const data = asObject(body);
  const errors: Record<string, string> = {};
  const email = check(errors, 'email', data.email, validateEmail);
  const password = text(data.password);
  if (password === null || password === '') errors.password = 'Password is required';
  failIfAny(errors);
  return {
    email: normalizeEmail(email),
    password: password as string,
    remember: data.remember === true,
  };
}
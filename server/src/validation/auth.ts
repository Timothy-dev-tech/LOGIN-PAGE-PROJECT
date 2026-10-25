import { asObject, check, failIfAny, text } from './helpers.js';
import {
  normalizeEmail,
  normalizeName,
  validateEmail,
  validateName,
  validatePassword,
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
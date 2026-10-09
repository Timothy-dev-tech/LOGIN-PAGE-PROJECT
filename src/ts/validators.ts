// Pure validation rules. No DOM, no network: they take a string and return a
// result, so they are easy to unit test and the server can mirror the same rules.

export type ValidationResult =
  | { valid: true }
  | { valid: false; message: string };

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt only uses the first 72 BYTES of a password, so we refuse anything longer.
export const PASSWORD_MAX_BYTES = 72;
const EMAIL_MAX_LENGTH = 254;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ok = (): ValidationResult => ({ valid: true });
const fail = (message: string): ValidationResult => ({ valid: false, message });

export function validateEmail(email: string): ValidationResult {
  const value = email.trim();
  if (value === '') return fail('Email is required');
  if (value.length > EMAIL_MAX_LENGTH) return fail('Email is too long');
  if (!EMAIL_PATTERN.test(value)) return fail('Please enter a valid email');
  return ok();
}

// Rules for CHOOSING a password (register page).
export function validatePassword(password: string): ValidationResult {
  if (password === '') return fail('Password is required');
  if (password.length < PASSWORD_MIN_LENGTH) {
    return fail(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return fail('Password is too long');
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return fail('Password must contain at least one letter and one number');
  }
  return ok();
}

// Rules for ENTERING a password (login page). We only check it is present;
// the server decides if it is correct, and old passwords may predate the rules.
export function validateLoginPassword(password: string): ValidationResult {
  if (password === '') return fail('Password is required');
  return ok();
}

export function validateConfirmPassword(
  password: string,
  confirmation: string,
): ValidationResult {
  if (confirmation === '') return fail('Please confirm your password');
  if (password !== confirmation) return fail('Passwords do not match');
  return ok();
}
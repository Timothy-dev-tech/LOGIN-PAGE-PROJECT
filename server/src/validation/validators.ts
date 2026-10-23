// The server's copy of the rules in the frontend's src/ts/validators.ts. The frontend
// checks are for helping people; these are the ones that count, because anyone can skip
// the browser and call the API directly. Keep the two files in step.

export type ValidationResult =
  | { valid: true }
  | { valid: false; message: string };

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt only uses the first 72 BYTES of a password, so we refuse anything longer.
export const PASSWORD_MAX_BYTES = 72;
const EMAIL_MAX_LENGTH = 254;
export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 60;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_PATTERN = /^\p{L}[\p{L}\p{M}' .-]*$/u;

const ok = (): ValidationResult => ({ valid: true });
const fail = (message: string): ValidationResult => ({ valid: false, message });

export function validateEmail(email: string): ValidationResult {
  const value = email.trim();
  if (value === '') return fail('Email is required');
  if (value.length > EMAIL_MAX_LENGTH) return fail('Email is too long');
  if (!EMAIL_PATTERN.test(value)) return fail('Please enter a valid email');
  return ok();
}

export function validatePassword(password: string): ValidationResult {
  if (password === '') return fail('Password is required');
  if (password.length < PASSWORD_MIN_LENGTH) {
    return fail(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES)
    return fail('Password is too long');
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return fail('Password must contain at least one letter and one number');
  }
  return ok();
}

/** Cleans a name the same way the rules judge it: trimmed, inner runs of spaces collapsed. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function validateName(name: string): ValidationResult {
  const value = normalizeName(name);
  if (value === '') return fail('Full name is required');
  if (value.length < NAME_MIN_LENGTH)
    return fail(`Name must be at least ${NAME_MIN_LENGTH} characters`);
  if (value.length > NAME_MAX_LENGTH)
    return fail(`Name must be at most ${NAME_MAX_LENGTH} characters`);
  if (!NAME_PATTERN.test(value)) {
    return fail(
      'Name can only contain letters, spaces, apostrophes, dots and hyphens',
    );
  }
  return ok();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

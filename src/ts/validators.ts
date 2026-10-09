// Pure validation rules. No DOM, no network: they take a string and return a
// result, so they are easy to unit test and the server can mirror the same rules.

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

const ok = (): ValidationResult => ({ valid: true });
const fail = (message: string): ValidationResult => ({ valid: false, message });

export function validateEmail(email: string): ValidationResult {
  const value = email.trim();
  if (value === '') return fail('Email is required');
  if (value.length > EMAIL_MAX_LENGTH) return fail('Email is too long');
  if (!EMAIL_PATTERN.test(value)) return fail('Please enter a valid email');
  return ok();
}

export type PasswordRules = {
  minLength: boolean;
  hasLetterAndNumber: boolean;
  withinMaxBytes: boolean;
};

// One place that knows what the rules are. validatePassword uses it for the
// error message, and the register page uses it for the live checklist.
export function getPasswordRules(password: string): PasswordRules {
  return {
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    hasLetterAndNumber: /[A-Za-z]/.test(password) && /[0-9]/.test(password),
    withinMaxBytes:
      new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES,
  };
}

// Rules for CHOOSING a password (register page).
export function validatePassword(password: string): ValidationResult {
  if (password === '') return fail('Password is required');
  const rules = getPasswordRules(password);
  if (!rules.minLength) {
    return fail(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (!rules.withinMaxBytes) return fail('Password is too long');
  if (!rules.hasLetterAndNumber) {
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
// Letters from any language (so Wanjiru, Müller, Nguyễn all work), plus spaces,
// apostrophes, dots and hyphens (O'Brien, Mary-Jane, St. John).
const NAME_PATTERN = /^\p{L}[\p{L}\p{M}' .-]*$/u;

export function validateName(name: string): ValidationResult {
  const value = name.trim().replace(/\s+/g, ' ');
  if (value === '') return fail('Full name is required');
  if (value.length < NAME_MIN_LENGTH) {
    return fail(`Name must be at least ${NAME_MIN_LENGTH} characters`);
  }
  if (value.length > NAME_MAX_LENGTH) {
    return fail(`Name must be at most ${NAME_MAX_LENGTH} characters`);
  }
  if (!NAME_PATTERN.test(value)) {
    return fail('Name can only contain letters, spaces, apostrophes, dots and hyphens');
  }
  return ok();
}

export function validateTermsAccepted(accepted: boolean): ValidationResult {
  if (!accepted) return fail('You must agree to continue');
  return ok();
}
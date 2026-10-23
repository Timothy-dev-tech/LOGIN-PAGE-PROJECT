import { ApiError, register } from './api';
import { byId } from './dom';
import {
  applyResult,
  clearFormError,
  setBusy,
  setupPasswordToggle,
  showError,
  showFormError,
  watchField,
} from './form-ui';
import { initThemeToggle } from './theme';
import {
  getPasswordRules,
  validateConfirmPassword,
  validateEmail,
  validateName,
  validatePassword,
  validateTermsAccepted,
} from './validators';

const form = byId('registerForm', HTMLFormElement);
const registerView = byId('registerView', HTMLDivElement);
const success = byId('success', HTMLElement);
const successTitle = byId('successTitle', HTMLHeadingElement);
const successName = byId('successName', HTMLSpanElement);

const fullName = byId('fullName', HTMLInputElement);
const fullNameError = byId('fullNameError', HTMLSpanElement);
const email = byId('email', HTMLInputElement);
const emailError = byId('emailError', HTMLSpanElement);
const password = byId('password', HTMLInputElement);
const passwordError = byId('passwordError', HTMLSpanElement);
const confirmPassword = byId('confirmPassword', HTMLInputElement);
const confirmPasswordError = byId('confirmPasswordError', HTMLSpanElement);
const terms = byId('terms', HTMLInputElement);
const termsError = byId('termsError', HTMLSpanElement);
const formError = byId('formError', HTMLParagraphElement);
const submitButton = byId('submitButton', HTMLButtonElement);

setupPasswordToggle(byId('passwordToggle', HTMLInputElement), [password, confirmPassword]);
initThemeToggle(byId('themeToggle', HTMLButtonElement));

const validateConfirm = () => validateConfirmPassword(password.value, confirmPassword.value);

watchField(fullName, fullNameError, () => validateName(fullName.value));
watchField(email, emailError, () => validateEmail(email.value));
watchField(password, passwordError, () => validatePassword(password.value));
watchField(confirmPassword, confirmPasswordError, validateConfirm);
terms.addEventListener('change', () => {
  applyResult(terms, termsError, validateTermsAccepted(terms.checked));
});

// Live checklist under the password field.
const ruleItems = document.querySelectorAll<HTMLLIElement>('#passwordRules li');

function updatePasswordRules(): void {
  const rules = getPasswordRules(password.value);
  for (const item of ruleItems) {
    const key = item.dataset.rule as keyof typeof rules;
    const met = rules[key];
    item.dataset.met = String(met);
    // Colour and the check mark are not enough on their own, so say it in text too.
    const status = item.querySelector('.visually-hidden');
    if (status) status.textContent = met ? ' (met)' : ' (not met)';
  }
}

password.addEventListener('input', () => {
  updatePasswordRules();
  // If the user changes the password after typing a confirmation, re-check the match.
  if (confirmPassword.value !== '') {
    applyResult(confirmPassword, confirmPasswordError, validateConfirm());
  }
});
updatePasswordRules();

function showSuccess(name: string): void {
  successName.textContent = name.trim().split(/\s+/)[0] ?? '';
  registerView.hidden = true;
  success.hidden = false;
  // Move focus to the heading so screen readers announce the confirmation.
  successTitle.focus();
}

// The server checks the same rules again (never trust the browser). If it disagrees, its messages
// are shown under the matching fields. The keys are the names the API uses.
const serverFields: Record<string, [HTMLInputElement, HTMLElement]> = {
  name: [fullName, fullNameError],
  email: [email, emailError],
  password: [password, passwordError],
  termsAccepted: [terms, termsError],
};

function showServerError(error: unknown): void {
  if (!(error instanceof ApiError)) {
    showFormError(formError, 'Something went wrong. Please try again.');
    return;
  }
  let first: HTMLInputElement | null = null;
  for (const [key, message] of Object.entries(error.fieldErrors)) {
    const field = serverFields[key];
    if (!field) continue;
    showError(field[0], field[1], message);
    first ??= field[0];
  }
  if (first) first.focus();
  else showFormError(formError, error.message);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFormError(formError);

  // Check every field (no early exit) so all the errors show at once.
  const checks: Array<[HTMLInputElement, boolean]> = [
    [fullName, applyResult(fullName, fullNameError, validateName(fullName.value))],
    [email, applyResult(email, emailError, validateEmail(email.value))],
    [password, applyResult(password, passwordError, validatePassword(password.value))],
    [confirmPassword, applyResult(confirmPassword, confirmPasswordError, validateConfirm())],
    [terms, applyResult(terms, termsError, validateTermsAccepted(terms.checked))],
  ];

  const firstInvalid = checks.find(([, ok]) => !ok);
  if (firstInvalid) {
    firstInvalid[0].focus();
    return;
  }

  setBusy(submitButton, true, 'Creating account\u2026');
  try {
    const user = await register({
      name: fullName.value,
      email: email.value,
      password: password.value,
      termsAccepted: terms.checked,
    });
    // Only now, when the server has confirmed the account exists, do we say so.
    showSuccess(user.name);
  } catch (error) {
    showServerError(error);
  } finally {
    setBusy(submitButton, false, '');
  }
});
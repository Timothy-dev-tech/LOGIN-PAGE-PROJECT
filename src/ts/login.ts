import { ApiError, login, refresh, verifyTwoFactor } from './api';
import { forgetSession, hasSessionHint, rememberSession } from './auth-guard';
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
import { factorBody, validateFactor, type FactorMode } from './two-factor-validators';
import { validateEmail, validateLoginPassword } from './validators';

const form = byId('loginForm', HTMLFormElement);
const email = byId('email', HTMLInputElement);
const emailError = byId('emailError', HTMLSpanElement);
const password = byId('password', HTMLInputElement);
const passwordError = byId('passwordError', HTMLSpanElement);
const remember = byId('remember', HTMLInputElement);
const formError = byId('formError', HTMLParagraphElement);
const submitButton = byId('submitButton', HTMLButtonElement);

setupPasswordToggle(byId('passwordToggle', HTMLInputElement), [password]);
initThemeToggle(byId('themeToggle', HTMLButtonElement));

watchField(email, emailError, () => validateEmail(email.value));
watchField(password, passwordError, () => validateLoginPassword(password.value));

const DASHBOARD = '/dashboard.html';

// Arrived here because the dashboard could not confirm a session (expired, or signed out elsewhere).
if (new URLSearchParams(location.search).get('reason') === 'expired') {
  showFormError(formError, 'Your session ended. Please sign in again.');
}

// Already signed in? Skip the form. The refresh cookie is httpOnly so the page cannot look for it;
// the hint (see auth-guard.ts) just avoids asking the server when we know the answer is no.
async function skipIfSignedIn(): Promise<void> {
  if (!hasSessionHint()) return;
  try {
    await refresh();
    location.replace(DASHBOARD);
  } catch {
    forgetSession(); // the cookie is gone or expired: show the form as normal
  }
}
void skipIfSignedIn();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFormError(formError);

  const emailOk = applyResult(email, emailError, validateEmail(email.value));
  const passwordOk = applyResult(password, passwordError, validateLoginPassword(password.value));

  // Send keyboard and screen-reader users to the first field that needs fixing.
  if (!emailOk) {
    email.focus();
    return;
  }
  if (!passwordOk) {
    password.focus();
    return;
  }

  setBusy(submitButton, true, 'Signing in\u2026');
  try {
    const outcome = await login({
      email: email.value,
      password: password.value,
      remember: remember.checked,
    });
    password.value = '';
    if (outcome.kind === 'two_factor') {
      showSecondStep(outcome.challengeToken);
      return;
    }
    rememberSession();
    // A new page load starts without the in-memory token; the dashboard gets a fresh one with the cookie.
    location.assign(DASHBOARD);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'invalid_credentials') {
      // One message for "no such email" and "wrong password", on purpose (see the API).
      showError(password, passwordError, error.message);
      password.focus();
    } else if (error instanceof ApiError) {
      showFormError(formError, error.message);
    } else {
      showFormError(formError, 'Something went wrong. Please try again.');
    }
  } finally {
    setBusy(submitButton, false, '');
  }
});

// ---- Second step: two-factor code -----------------------------------------------------------
const loginView = byId('loginView', HTMLDivElement);
const twoFactorView = byId('twoFactorView', HTMLDivElement);
const twoFactorForm = byId('twoFactorForm', HTMLFormElement);
const codeInput = byId('twoFactorCode', HTMLInputElement);
const codeError = byId('twoFactorCodeError', HTMLSpanElement);
const codeLabel = byId('codeLabel', HTMLLabelElement);
const twoFactorHelp = byId('twoFactorHelp', HTMLParagraphElement);
const twoFactorFormError = byId('twoFactorFormError', HTMLParagraphElement);
const twoFactorSubmit = byId('twoFactorSubmit', HTMLButtonElement);
const modeSwitch = byId('modeSwitch', HTMLButtonElement);
const backButton = byId('backToPassword', HTMLButtonElement);

// The challenge proves the password step was passed. It lives only in this variable and expires
// after 5 minutes on the server.
let challengeToken: string | null = null;
let mode: FactorMode = 'app';

function setMode(next: FactorMode): void {
  mode = next;
  codeInput.value = '';
  applyResult(codeInput, codeError, { valid: true });
  clearFormError(twoFactorFormError);
  if (mode === 'app') {
    codeLabel.textContent = '6-digit code';
    twoFactorHelp.textContent = 'Open your authenticator app and enter the 6-digit code.';
    codeInput.setAttribute('inputmode', 'numeric');
    codeInput.setAttribute('autocomplete', 'one-time-code');
    codeInput.placeholder = '123456';
    modeSwitch.textContent = 'Use a recovery code instead';
  } else {
    codeLabel.textContent = 'Recovery code';
    twoFactorHelp.textContent = 'Enter one of the recovery codes you saved. Each one works once.';
    codeInput.setAttribute('inputmode', 'text');
    codeInput.setAttribute('autocomplete', 'off');
    codeInput.placeholder = 'abcde-fghjk';
    modeSwitch.textContent = 'Use the app code instead';
  }
  codeInput.focus();
}

function showSecondStep(token: string): void {
  challengeToken = token;
  loginView.hidden = true;
  twoFactorView.hidden = false;
  setMode('app');
}

function backToPasswordStep(message?: string): void {
  challengeToken = null;
  twoFactorView.hidden = true;
  loginView.hidden = false;
  if (message) showFormError(formError, message);
  password.focus();
}

watchField(codeInput, codeError, () => validateFactor(codeInput.value, mode));
modeSwitch.addEventListener('click', () => setMode(mode === 'app' ? 'recovery' : 'app'));
backButton.addEventListener('click', () => backToPasswordStep());

twoFactorForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFormError(twoFactorFormError);
  if (!challengeToken) return backToPasswordStep();
  if (!applyResult(codeInput, codeError, validateFactor(codeInput.value, mode))) {
    codeInput.focus();
    return;
  }

  setBusy(twoFactorSubmit, true, 'Checking\u2026');
  try {
    await verifyTwoFactor(challengeToken, factorBody(codeInput.value, mode));
    rememberSession();
    location.assign(DASHBOARD);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'invalid_challenge') {
      backToPasswordStep('Your sign-in timed out. Please enter your password again.');
    } else if (error instanceof ApiError && error.code === 'invalid_two_factor_code') {
      showError(
        codeInput,
        codeError,
        mode === 'app' ? 'That code is not right, or was already used. Wait for a new one.' : 'That recovery code is not right, or was already used.',
      );
      codeInput.select();
    } else if (error instanceof ApiError) {
      showFormError(twoFactorFormError, error.message); // for example: locked for 15 minutes
    } else {
      showFormError(twoFactorFormError, 'Something went wrong. Please try again.');
    }
  } finally {
    setBusy(twoFactorSubmit, false, '');
  }
});
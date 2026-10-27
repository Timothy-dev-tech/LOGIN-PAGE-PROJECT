import { ApiError, login, refresh } from './api';
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
    await login({
      email: email.value,
      password: password.value,
      remember: remember.checked,
    });
    password.value = '';
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
import { ApiError, login, logout } from './api';
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
const loginView = byId('loginView', HTMLDivElement);
const email = byId('email', HTMLInputElement);
const emailError = byId('emailError', HTMLSpanElement);
const password = byId('password', HTMLInputElement);
const passwordError = byId('passwordError', HTMLSpanElement);
const remember = byId('remember', HTMLInputElement);
const formError = byId('formError', HTMLParagraphElement);
const submitButton = byId('submitButton', HTMLButtonElement);
const signedIn = byId('signedIn', HTMLElement);
const signedInTitle = byId('signedInTitle', HTMLHeadingElement);
const signedInName = byId('signedInName', HTMLSpanElement);
const signOutButton = byId('signOutButton', HTMLButtonElement);

setupPasswordToggle(byId('passwordToggle', HTMLInputElement), [password]);
initThemeToggle(byId('themeToggle', HTMLButtonElement));

watchField(email, emailError, () => validateEmail(email.value));
watchField(password, passwordError, () => validateLoginPassword(password.value));

// TEMPORARY (until the dashboard exists in step 9): show a signed-in panel here instead of
// redirecting to a page that is not built yet.
function showSignedIn(name: string): void {
  signedInName.textContent = name.trim().split(/\s+/)[0] ?? '';
  loginView.hidden = true;
  signedIn.hidden = false;
  signedInTitle.focus();
}

signOutButton.addEventListener('click', async () => {
  await logout().catch(() => undefined); // the browser forgets the token even if the call fails
  password.value = '';
  signedIn.hidden = true;
  loginView.hidden = false;
  email.focus();
});

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
    const user = await login({
      email: email.value,
      password: password.value,
      remember: remember.checked,
    });
    password.value = '';
    showSignedIn(user.name);
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
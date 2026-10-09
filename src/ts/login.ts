import { byId } from './dom';
import { applyResult, setupPasswordToggle, watchField } from './form-ui';
import { validateEmail, validateLoginPassword } from './validators';

const form = byId('loginForm', HTMLFormElement);
const email = byId('email', HTMLInputElement);
const emailError = byId('emailError', HTMLSpanElement);
const password = byId('password', HTMLInputElement);
const passwordError = byId('passwordError', HTMLSpanElement);

setupPasswordToggle(byId('passwordToggle', HTMLInputElement), [password]);

watchField(email, emailError, () => validateEmail(email.value));
watchField(password, passwordError, () =>
  validateLoginPassword(password.value),
);

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const emailOk = applyResult(email, emailError, validateEmail(email.value));
  const passwordOk = applyResult(
    password,
    passwordError,
    validateLoginPassword(password.value),
  );

  // Send keyboard and screen-reader users to the first field that needs fixing.
  if (!emailOk) {
    email.focus();
    return;
  }
  if (!passwordOk) {
    password.focus();
    return;
  }

  // TODO(step 6): send the credentials to POST /api/auth/login.
  console.log('Login form is valid');
});

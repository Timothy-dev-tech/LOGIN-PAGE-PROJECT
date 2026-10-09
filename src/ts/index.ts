import { validateEmail, validateLoginPassword } from './validators';

const passwordToggle = document.getElementById(
  'passwordToggle',
) as HTMLInputElement;
const passwordInput = document.getElementById('password') as HTMLInputElement;

passwordToggle.addEventListener('change', () => {
  passwordInput.type = passwordToggle.checked ? 'text' : 'password';
});

const loginForm = document.getElementById('loginForm') as HTMLFormElement;
const emailInput = document.getElementById('email') as HTMLInputElement;
const emailError = document.getElementById('emailError') as HTMLSpanElement;
const passwordError = document.getElementById(
  'passwordError',
) as HTMLSpanElement;

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const emailResult = validateEmail(emailInput.value);
  const passwordResult = validateLoginPassword(passwordInput.value);

  emailError.textContent = emailResult.valid ? '' : emailResult.message;
  passwordError.textContent = passwordResult.valid ? '' : passwordResult.message;

  if (emailResult.valid && passwordResult.valid) {
    console.log('Form is valid, submitting...');
  }
});

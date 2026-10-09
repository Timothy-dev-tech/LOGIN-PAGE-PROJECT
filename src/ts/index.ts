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
  let isValid = true;
  const emailValue = emailInput.value;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(emailValue)) {
    isValid = false;
    emailError.textContent = 'Please enter a valid email';
  } else {
    emailError.textContent = '';
  }

  const passwordValue = passwordInput.value;

  if (passwordValue.length < 8) {
    isValid = false;
    passwordError.textContent = 'Password must be at least 8 characters';
  } else {
    passwordError.textContent = '';
  }

  if (isValid) {
    console.log('Form is valid, submitting...');
  }
});

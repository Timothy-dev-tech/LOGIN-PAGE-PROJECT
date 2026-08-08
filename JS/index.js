const passwordToggle = document.getElementById('passwordToggle');
const passwordInput = document.getElementById('password');

passwordToggle.addEventListener('change', () => {
  passwordInput.type = passwordToggle.checked ? 'text' : 'password';
});

const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const emailError = document.getElementById('emailError');
const passwordError = document.getElementById('passwordError');

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

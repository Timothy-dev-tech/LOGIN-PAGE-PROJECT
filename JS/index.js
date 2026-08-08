const passwordToggle = document.getElementById('passwordToggle');
const passwordInput = document.getElementById('password');

passwordToggle.addEventListener('change', () => {
  passwordInput.type = passwordToggle.checked ? 'text' : 'password';
});

const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const emailError = document.getElementById('emailError');

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const emailValue = emailInput.value;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(emailValue)) {
    emailError.textContent = 'Please enter a valid email';
  } else {
    emailError.textContent = '';
  }
});

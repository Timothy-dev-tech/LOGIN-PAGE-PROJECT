const passwordToggle = document.getElementById('passwordToggle');
const passwordInput = document.getElementById('password');

passwordToggle.addEventListener('change', () => {
    passwordInput.type = passwordToggle.checked ? "text" : "password";
});


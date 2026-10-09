import type { ValidationResult } from './validators';

// Show a message under a field and mark the field invalid for assistive tech.
export function showError(input: HTMLInputElement, errorEl: HTMLElement, message: string): void {
  errorEl.textContent = message;
  input.setAttribute('aria-invalid', 'true');
}

export function clearError(input: HTMLInputElement, errorEl: HTMLElement): void {
  errorEl.textContent = '';
  input.removeAttribute('aria-invalid');
}

// Apply a validation result to a field. Returns true when the field is valid.
export function applyResult(
  input: HTMLInputElement,
  errorEl: HTMLElement,
  result: ValidationResult,
): boolean {
  if (result.valid) {
    clearError(input, errorEl);
    return true;
  }
  showError(input, errorEl, result.message);
  return false;
}

// Validate when the user leaves the field, then re-check on every keystroke
// only after it has been flagged, so we never nag someone mid-typing.
export function watchField(
  input: HTMLInputElement,
  errorEl: HTMLElement,
  validate: () => ValidationResult,
): void {
  input.addEventListener('blur', () => {
    applyResult(input, errorEl, validate());
  });
  input.addEventListener('input', () => {
    if (input.hasAttribute('aria-invalid')) {
      applyResult(input, errorEl, validate());
    }
  });
}

// The "Show password" checkbox switches one or more fields between text and password.
export function setupPasswordToggle(checkbox: HTMLInputElement, inputs: HTMLInputElement[]): void {
  checkbox.addEventListener('change', () => {
    for (const input of inputs) {
      input.type = checkbox.checked ? 'text' : 'password';
    }
  });
}
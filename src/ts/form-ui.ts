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

// A message that belongs to the whole form (network trouble, too many attempts...), shown above the
// button. role="alert" on the element makes screen readers read it out when it appears.
export function showFormError(el: HTMLElement, message: string): void {
  el.textContent = message;
  el.hidden = false;
}

export function clearFormError(el: HTMLElement): void {
  el.textContent = '';
  el.hidden = true;
}

// Disables the submit button while a request is running, so a double click cannot send it twice.
export function setBusy(button: HTMLButtonElement, busy: boolean, busyLabel: string): void {
  if (busy) {
    button.dataset.label = button.textContent ?? '';
    button.textContent = busyLabel;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
}
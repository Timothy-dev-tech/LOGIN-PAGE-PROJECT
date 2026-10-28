import {
  ApiError,
  disableTwoFactor,
  enableTwoFactor,
  regenerateRecoveryCodes,
  startTwoFactorSetup,
  twoFactorStatus,
  type SecondFactor,
  type TwoFactorSetup,
  type TwoFactorStatus,
} from '../api';
import { el } from '../el';
import { applyResult, clearFormError, setBusy, showError, showFormError, watchField } from '../form-ui';
import {
  factorBody,
  groupSecret,
  validateAppCode,
  validateFactor,
  type FactorMode,
} from '../two-factor-validators';
import { field, handleViewError, messageBox, viewHeader } from './shared';

let formCounter = 0;

/**
 * A small form for the sensitive actions. Always asks for the password again (a stolen or left-open
 * session should not be able to change security settings). With `needFactor` it also asks for a
 * code from the app, with a switch to a recovery code for people who lost their phone.
 */
function confirmForm(options: {
  intro: string;
  submitLabel: string;
  danger?: boolean;
  needFactor: boolean;
  onSubmit: (password: string, factor: SecondFactor | null) => Promise<void>;
  onCancel: () => void;
}): HTMLFormElement {
  const id = `cf${++formCounter}`;
  let mode: FactorMode = 'app';

  const password = el('input', { type: 'password', autocomplete: 'current-password', name: 'password' });
  const passwordField = field('Password', `${id}Password`, password);
  const factor = el('input', { type: 'text', autocomplete: 'one-time-code', inputmode: 'numeric', name: 'code', placeholder: '123456' });
  const factorLabel = el('label', { for: `${id}Factor` }, '6-digit code from your app');
  const factorError = el('span', { id: `${id}FactorError`, class: 'error-message', 'aria-live': 'polite' });
  factor.id = `${id}Factor`;
  factor.setAttribute('aria-describedby', `${id}FactorError`);
  const switchMode = el('button', { type: 'button', class: 'link-button' }, 'Use a recovery code instead');
  const factorBox = el('div', { class: 'field', hidden: !options.needFactor }, factorLabel, factor, factorError, switchMode);

  function applyMode(): void {
    factor.value = '';
    applyResult(factor, factorError, { valid: true });
    if (mode === 'app') {
      factorLabel.textContent = '6-digit code from your app';
      factor.setAttribute('inputmode', 'numeric');
      factor.setAttribute('autocomplete', 'one-time-code');
      factor.placeholder = '123456';
      switchMode.textContent = 'Use a recovery code instead';
    } else {
      factorLabel.textContent = 'Recovery code';
      factor.setAttribute('inputmode', 'text');
      factor.setAttribute('autocomplete', 'off');
      factor.placeholder = 'abcde-fghjk';
      switchMode.textContent = 'Use the app code instead';
    }
    factor.focus();
  }
  switchMode.addEventListener('click', () => {
    mode = mode === 'app' ? 'recovery' : 'app';
    applyMode();
  });

  const formError = el('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = el('button', { type: 'submit', class: options.danger ? 'btn btn--danger' : 'btn' }, options.submitLabel);
  const cancel = el('button', { type: 'button', class: 'btn btn--quiet', onclick: () => options.onCancel() }, 'Cancel');

  const form = el(
    'form',
    { class: 'stack-form', novalidate: true },
    el('p', { class: 'form-intro' }, options.intro),
    passwordField.box,
    factorBox,
    formError,
    el('div', { class: 'form-actions' }, submit, cancel),
  );

  watchField(password, passwordField.error, () => (password.value === '' ? { valid: false, message: 'Password is required' } : { valid: true }));
  watchField(factor, factorError, () => validateFactor(factor.value, mode));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormError(formError);
    const passwordOk = applyResult(password, passwordField.error, password.value === '' ? { valid: false, message: 'Password is required' } : { valid: true });
    const factorOk = !options.needFactor || applyResult(factor, factorError, validateFactor(factor.value, mode));
    if (!passwordOk) return void password.focus();
    if (!factorOk) return void factor.focus();

    setBusy(submit, true, 'Working\u2026');
    try {
      await options.onSubmit(password.value, options.needFactor ? factorBody(factor.value, mode) : null);
    } catch (error) {
      setBusy(submit, false, '');
      if (error instanceof ApiError && error.code === 'incorrect_password') {
        showError(password, passwordField.error, error.message);
        password.focus();
      } else if (error instanceof ApiError && error.code === 'invalid_two_factor_code') {
        showError(factor, factorError, mode === 'app' ? 'That code is not right, or was already used. Wait for a new one.' : 'That recovery code is not right, or was already used.');
        factor.focus();
      } else {
        handleViewError(error, (message) => showFormError(formError, message));
      }
    }
  });
  return form;
}

/** The recovery codes, shown once. "Done" stays disabled until the person says they saved them. */
function recoveryCodesPanel(codes: string[], onDone: () => void): HTMLElement {
  const copyStatus = el('span', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const text = codes.join('\n');

  const copy = el('button', {
    type: 'button',
    class: 'btn btn--quiet',
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(text);
        copyStatus.textContent = 'Copied.';
      } catch {
        copyStatus.textContent = 'Could not copy. Select the codes and copy them by hand.';
      }
    },
  }, 'Copy');
  const download = el('button', {
    type: 'button',
    class: 'btn btn--quiet',
    onclick: () => {
      const url = URL.createObjectURL(new Blob([`TimSol recovery codes\nEach code works once.\n\n${text}\n`], { type: 'text/plain' }));
      const link = el('a', { href: url, download: 'timsol-recovery-codes.txt' });
      link.click();
      URL.revokeObjectURL(url);
    },
  }, 'Download');

  const saved = el('input', { type: 'checkbox', id: 'codesSaved' });
  const done = el('button', { type: 'button', class: 'btn', disabled: true, onclick: () => onDone() }, 'Done');
  saved.addEventListener('change', () => (done.disabled = !saved.checked));

  return el(
    'div',
    { class: 'card-block' },
    el('h2', { class: 'section-title', id: 'codesTitle', tabindex: '-1' }, 'Save your recovery codes'),
    el('p', { class: 'form-intro' }, 'If you lose your phone, each of these signs you in once. They are shown only now. Keep them somewhere safe, like a password manager.'),
    el('ul', { class: 'codes', 'aria-labelledby': 'codesTitle' }, ...codes.map((code) => el('li', {}, el('code', {}, code)))),
    el('div', { class: 'form-actions' }, copy, download, copyStatus),
    el('label', { class: 'check-label', for: 'codesSaved' }, saved, 'I have saved these codes'),
    el('div', { class: 'form-actions' }, done),
  );
}

export async function renderSecurity(root: HTMLElement): Promise<void> {
  const area = el('div', { class: 'list-area' });
  const status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
  root.append(
    ...viewHeader('Security', 'Two-factor authentication asks for a code from your phone after your password, so a leaked password alone is not enough.'),
    status,
    area,
  );

  async function load(message = ''): Promise<void> {
    try {
      const current = await twoFactorStatus();
      area.replaceChildren(current.enabled ? enabledPanel(current) : offPanel());
      status.textContent = message;
    } catch (error) {
      handleViewError(error, (text) => area.replaceChildren(messageBox(text, () => void load())));
    }
  }

  // ---- 2FA is off: explain, ask for the password, show the QR code, confirm with a code ----
  function offPanel(): HTMLElement {
    const panel = el('div', { class: 'card-block' });
    const begin = el('button', { type: 'button', class: 'btn', onclick: () => showPasswordStep() }, 'Turn on two-factor authentication');
    panel.append(
      el('h2', { class: 'section-title' }, 'Two-factor authentication is off'),
      el('p', { class: 'form-intro' }, 'You will need an authenticator app such as Google Authenticator, Microsoft Authenticator or Aegis.'),
      begin,
    );

    function showPasswordStep(): void {
      panel.replaceChildren(
        el('h2', { class: 'section-title' }, 'Step 1 of 2: confirm it is you'),
        confirmForm({
          intro: 'Enter your password to start.',
          submitLabel: 'Continue',
          needFactor: false,
          onCancel: () => void load(),
          onSubmit: async (password) => showScanStep(await startTwoFactorSetup(password)),
        }),
      );
      panel.querySelector('input')?.focus();
    }

    function showScanStep(setup: TwoFactorSetup): void {
      const code = el('input', { type: 'text', autocomplete: 'one-time-code', inputmode: 'numeric', name: 'code', placeholder: '123456' });
      const codeField = field('6-digit code from your app', 'enableCode', code);
      const formError = el('p', { class: 'form-error', role: 'alert', hidden: true });
      const submit = el('button', { type: 'submit', class: 'btn' }, 'Turn on');
      const form = el('form', { class: 'stack-form', novalidate: true }, codeField.box, formError, el('div', { class: 'form-actions' }, submit, el('button', { type: 'button', class: 'btn btn--quiet', onclick: () => void load() }, 'Cancel')));
      watchField(code, codeField.error, () => validateAppCode(code.value));
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearFormError(formError);
        if (!applyResult(code, codeField.error, validateAppCode(code.value))) return void code.focus();
        setBusy(submit, true, 'Checking\u2026');
        try {
          const codes = await enableTwoFactor(code.value.replace(/\s/g, ''));
          panel.replaceChildren(recoveryCodesPanel(codes, () => void load('Two-factor authentication is on.')));
          panel.querySelector<HTMLElement>('#codesTitle')?.focus();
        } catch (error) {
          if (error instanceof ApiError && error.code === 'invalid_two_factor_code') {
            showError(code, codeField.error, 'That code is not right. Check the app and try the new code.');
            code.focus();
          } else handleViewError(error, (message) => showFormError(formError, message));
        } finally {
          setBusy(submit, false, '');
        }
      });

      // The QR image comes from our own server as a data URL. Only an image data URL is allowed in.
      const qr = setup.qrDataUrl.startsWith('data:image/png;base64,')
        ? el('img', { class: 'qr', src: setup.qrDataUrl, alt: 'QR code to scan with your authenticator app', width: 224, height: 224 })
        : null;
      panel.replaceChildren(
        el('h2', { class: 'section-title' }, 'Step 2 of 2: scan and confirm'),
        el('p', { class: 'form-intro' }, 'Scan this with your authenticator app, then type the 6-digit code it shows.'),
        el('div', { class: 'setup-grid' },
          qr,
          el('div', {},
            el('p', { class: 'form-intro' }, 'Cannot scan? Type this key into the app instead:'),
            el('p', {}, el('code', { class: 'secret-key' }, groupSecret(setup.secret))),
          ),
        ),
        form,
      );
      code.focus();
    }
    return panel;
  }

  // ---- 2FA is on: status, new recovery codes, turn off ----
  function enabledPanel(current: TwoFactorStatus): HTMLElement {
    const left = current.recoveryCodesRemaining;
    const low = left <= 2;
    const actions = el('div', { class: 'form-actions' });
    const panel = el(
      'div',
      { class: 'card-block' },
      el('h2', { class: 'section-title' }, 'Two-factor authentication is on'),
      el('p', { class: low ? 'form-intro form-intro--warn' : 'form-intro' },
        left === 0
          ? 'You have no recovery codes left. Make new ones now, in case you lose your phone.'
          : `${left} recovery code${left === 1 ? '' : 's'} left.${low ? ' Consider making new ones.' : ''}`),
      actions,
    );
    const slot = el('div', {});
    panel.append(slot);

    function open(form: HTMLElement): void {
      actions.hidden = true;
      slot.replaceChildren(form);
      form.querySelector('input')?.focus();
    }
    const close = (): void => {
      slot.replaceChildren();
      actions.hidden = false;
    };

    actions.append(
      el('button', {
        type: 'button',
        class: 'btn btn--quiet',
        onclick: () =>
          open(
            confirmForm({
              intro: 'Making new codes makes the old ones stop working.',
              submitLabel: 'Make new codes',
              needFactor: true,
              onCancel: close,
              onSubmit: async (password, factor) => {
                const codes = await regenerateRecoveryCodes(password, factor!);
                panel.replaceChildren(recoveryCodesPanel(codes, () => void load('New recovery codes saved.')));
                panel.querySelector<HTMLElement>('#codesTitle')?.focus();
              },
            }),
          ),
      }, 'Make new recovery codes'),
      el('button', {
        type: 'button',
        class: 'btn btn--quiet btn--danger',
        onclick: () =>
          open(
            confirmForm({
              intro: 'Your account will go back to a password only.',
              submitLabel: 'Turn off',
              danger: true,
              needFactor: true,
              onCancel: close,
              onSubmit: async (password, factor) => {
                await disableTwoFactor(password, factor!);
                await load('Two-factor authentication is off.');
              },
            }),
          ),
      }, 'Turn off'),
    );
    return panel;
  }

  area.append(el('p', { class: 'empty' }, 'Loading\u2026'));
  await load();
}
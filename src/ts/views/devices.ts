import { listSessions, revokeOtherSessions, revokeSession, type DeviceSession } from '../api';
import { el } from '../el';
import { formatDate, timeAgo } from '../format';
import { handleViewError, messageBox, viewHeader } from './shared';

export async function renderDevices(root: HTMLElement): Promise<void> {
  const status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const area = el('div', { class: 'list-area' });

  function row(session: DeviceSession): HTMLElement {
    const remembered = session.persistent
      ? `Remembered until ${formatDate(session.expiresAt)}`
      : 'Ends when the browser closes, or after 1 day';
    return el(
      'li',
      { class: 'entry' },
      el(
        'div',
        { class: 'entry-main' },
        el(
          'p',
          { class: 'entry-title' },
          session.device,
          session.current ? el('span', { class: 'badge' }, 'This device') : null,
        ),
        el('p', { class: 'entry-meta' }, `Signed in ${timeAgo(session.startedAt)} · Last active ${timeAgo(session.lastActiveAt)}`),
        el('p', { class: 'entry-notes' }, `${remembered} · Address ${session.ip || 'unknown'}`),
      ),
      session.current
        ? null
        : el(
            'div',
            { class: 'entry-actions' },
            el(
              'button',
              {
                type: 'button',
                class: 'btn btn--quiet btn--danger',
                'aria-label': `Sign out ${session.device}`,
                onclick: async (event) => {
                  const button = event.currentTarget as HTMLButtonElement;
                  button.disabled = true;
                  try {
                    await revokeSession(session.id);
                    await load(); // refresh the list first, so the message never describes a list that is out of date
                    status.textContent = `${session.device} was signed out.`;
                  } catch (error) {
                    button.disabled = false;
                    handleViewError(error, (message) => (status.textContent = message));
                  }
                },
              },
              'Sign out',
            ),
          ),
    );
  }

  async function load(): Promise<void> {
    try {
      const sessions = await listSessions();
      const others = sessions.filter((s) => !s.current).length;
      const othersButton = el(
        'button',
        {
          type: 'button',
          class: 'btn btn--quiet btn--danger',
          disabled: others === 0,
          onclick: async (event) => {
            const button = event.currentTarget as HTMLButtonElement;
            button.disabled = true;
            try {
              const count = await revokeOtherSessions();
              await load();
              status.textContent = count === 1 ? '1 other device was signed out.' : `${count} other devices were signed out.`;
            } catch (error) {
              button.disabled = false;
              handleViewError(error, (message) => (status.textContent = message));
            }
          },
        },
        'Sign out all other devices',
      );
      area.replaceChildren(
        el('div', { class: 'toolbar' }, el('p', { class: 'count' }, sessions.length === 1 ? '1 device signed in' : `${sessions.length} devices signed in`), othersButton),
        el('ul', { class: 'entries' }, ...sessions.map(row)),
      );
    } catch (error) {
      handleViewError(error, (message) => area.replaceChildren(messageBox(message, () => void load())));
    }
  }

  root.append(
    ...viewHeader('Devices', 'Everywhere you are signed in. If you do not recognise one, sign it out.'),
    status,
    area,
  );
  area.append(el('p', { class: 'empty' }, 'Loading…'));
  await load();
}
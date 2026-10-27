import { listUsers, type PublicUser } from '../api';
import { el } from '../el';
import { formatDate } from '../format';
import { handleViewError, loadMoreButton, messageBox, viewHeader } from './shared';

const PAGE_SIZE = 20;

/** Admin only. The tab is hidden for everyone else, and the server refuses non-admins anyway (403). */
export async function renderUsers(root: HTMLElement): Promise<void> {
  let items: PublicUser[] = [];
  let total = 0;
  const status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const area = el('div', { class: 'list-area' });

  function row(user: PublicUser): HTMLElement {
    return el(
      'li',
      { class: 'entry' },
      el(
        'div',
        { class: 'entry-main' },
        el('p', { class: 'entry-title' }, user.name, user.role === 'admin' ? el('span', { class: 'badge' }, 'Admin') : null),
        el('p', { class: 'entry-meta' }, user.email),
        el('p', { class: 'entry-notes' }, `Joined ${formatDate(user.createdAt)}`),
      ),
    );
  }

  function draw(): void {
    area.replaceChildren(
      el('ul', { class: 'entries' }, ...items.map(row)),
      el('div', { class: 'list-footer' }, el('p', { class: 'count' }, `Showing ${items.length} of ${total}`), items.length < total ? loadMoreButton(loadMore) : null),
    );
  }

  async function load(): Promise<void> {
    try {
      const result = await listUsers(1, PAGE_SIZE);
      items = result.items;
      total = result.total;
      draw();
    } catch (error) {
      handleViewError(error, (message) => area.replaceChildren(messageBox(message, () => void load())));
    }
  }

  async function loadMore(): Promise<void> {
    try {
      const result = await listUsers(Math.floor(items.length / PAGE_SIZE) + 1, PAGE_SIZE);
      items = [...items, ...result.items];
      total = result.total;
      draw();
    } catch (error) {
      handleViewError(error, (message) => (status.textContent = message));
    }
  }

  root.append(...viewHeader('Users', 'Everyone with an account. Only admins can see this page.'), status, area);
  area.append(el('p', { class: 'empty' }, 'Loading…'));
  await load();
}
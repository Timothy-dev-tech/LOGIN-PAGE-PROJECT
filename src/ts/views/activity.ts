import { listActivity, type ActivityItem } from '../api';
import { el } from '../el';
import { describeActivity, timeAgo } from '../format';
import { handleViewError, loadMoreButton, messageBox, viewHeader } from './shared';

const PAGE_SIZE = 20;

export async function renderActivity(root: HTMLElement): Promise<void> {
  let items: ActivityItem[] = [];
  let total = 0;
  const status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const area = el('div', { class: 'list-area' });

  function row(item: ActivityItem): HTMLElement {
    const { label, tone } = describeActivity(item.type);
    return el(
      'li',
      { class: `entry entry--${tone}` },
      el(
        'div',
        { class: 'entry-main' },
        el('p', { class: 'entry-title' }, label),
        el('p', { class: 'entry-meta' }, `${timeAgo(item.at)} · ${item.device} · ${item.ip || 'unknown address'}`),
      ),
    );
  }

  function draw(): void {
    if (items.length === 0) {
      area.replaceChildren(el('p', { class: 'empty' }, 'Nothing here yet.'));
      return;
    }
    area.replaceChildren(
      el('ul', { class: 'entries' }, ...items.map(row)),
      el('div', { class: 'list-footer' }, el('p', { class: 'count' }, `Showing ${items.length} of ${total}`), items.length < total ? loadMoreButton(loadMore) : null),
    );
  }

  async function load(): Promise<void> {
    try {
      const result = await listActivity(1, PAGE_SIZE);
      items = result.items;
      total = result.total;
      draw();
    } catch (error) {
      handleViewError(error, (message) => area.replaceChildren(messageBox(message, () => void load())));
    }
  }

  async function loadMore(): Promise<void> {
    try {
      const result = await listActivity(Math.floor(items.length / PAGE_SIZE) + 1, PAGE_SIZE);
      items = [...items, ...result.items];
      total = result.total;
      draw();
    } catch (error) {
      handleViewError(error, (message) => (status.textContent = message));
    }
  }

  root.append(
    ...viewHeader('Activity', 'Sign-ins and security events on your account. Entries are deleted after 90 days.'),
    status,
    area,
  );
  area.append(el('p', { class: 'empty' }, 'Loading…'));
  await load();
}
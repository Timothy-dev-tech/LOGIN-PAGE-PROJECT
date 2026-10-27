import { ApiError } from '../api';
import { forgetSession } from '../auth-guard';
import { el } from '../el';

/** What every view shows first: a heading the router can focus, and one line of context. */
export function viewHeader(title: string, lede: string): HTMLElement[] {
  return [
    el('h1', { id: 'viewTitle', tabindex: '-1' }, title),
    el('p', { class: 'lede' }, lede),
  ];
}

/**
 * One place that decides what a failed request means for the page:
 *   - 401 after the automatic refresh already failed -> the session is really over: log in again
 *   - anything else -> show the server's message (or a generic one) and let the person retry
 */
export function handleViewError(error: unknown, show: (message: string) => void): void {
  if (error instanceof ApiError && error.status === 401) {
    forgetSession();
    location.replace('/index.html?reason=expired');
    return;
  }
  show(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.');
}

/** A message with an optional "Try again" button, announced to screen readers. */
export function messageBox(message: string, onRetry?: () => void): HTMLElement {
  return el(
    'div',
    { class: 'message-box', role: 'alert' },
    el('p', {}, message),
    onRetry ? el('button', { type: 'button', class: 'btn btn--quiet', onclick: () => onRetry() }, 'Try again') : null,
  );
}

export function loadMoreButton(onClick: () => void): HTMLButtonElement {
  return el('button', { type: 'button', class: 'btn btn--quiet load-more', onclick: () => onClick() }, 'Load more');
}
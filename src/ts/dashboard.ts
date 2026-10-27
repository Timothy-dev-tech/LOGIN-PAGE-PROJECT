import { ApiError, logout, type PublicUser } from './api';
import { forgetSession, requireSession } from './auth-guard';
import { byId } from './dom';
import { el } from './el';
import { initThemeToggle } from './theme';
import { renderActivity } from './views/activity';
import { renderDevices } from './views/devices';
import { renderStudyLog } from './views/study-log';
import { renderUsers } from './views/users';

interface Route {
  title: string;
  adminOnly?: boolean;
  render: (root: HTMLElement) => Promise<void>;
}

// Pages are reached by the part of the address after #, e.g. /dashboard.html#devices. That
// keeps back/forward and bookmarks working without a router library.
const ROUTES: Record<string, Route> = {
  log: { title: 'Study log', render: renderStudyLog },
  devices: { title: 'Devices', render: renderDevices },
  activity: { title: 'Activity', render: renderActivity },
  users: { title: 'Users', adminOnly: true, render: renderUsers },
};
const DEFAULT_ROUTE = 'log';

const gate = byId('gate', HTMLDivElement);
const gateMessage = byId('gateMessage', HTMLParagraphElement);
const retryButton = byId('retryButton', HTMLButtonElement);
const app = byId('app', HTMLDivElement);
const view = byId('view', HTMLElement);
const userName = byId('userName', HTMLSpanElement);
const signOutButton = byId('signOutButton', HTMLButtonElement);

initThemeToggle(byId('themeToggle', HTMLButtonElement));

function routeFromHash(user: PublicUser): string {
  const name = location.hash.slice(1);
  const route = ROUTES[name];
  if (!route || (route.adminOnly && user.role !== 'admin')) return DEFAULT_ROUTE;
  return name;
}

async function show(name: string, focusHeading: boolean): Promise<void> {
  const route = ROUTES[name] ?? ROUTES[DEFAULT_ROUTE]!;
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-route]')) {
    if (link.dataset.route === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = `${route.title} · TimSol`;
  // Each visit gets its own container, so a slow request from a page we already left can only
  // write into a container that is no longer on screen.
  const section = el('section', { class: 'view-section' });
  view.replaceChildren(section);
  await route.render(section);
  if (focusHeading) section.querySelector<HTMLElement>('#viewTitle')?.focus();
}

async function start(): Promise<void> {
  gate.hidden = false;
  retryButton.hidden = true;
  gateMessage.textContent = 'Checking your session…';

  let user: PublicUser;
  try {
    user = await requireSession();
  } catch (error) {
    // status 0 = the request never reached the server; anything else is the server's own answer.
    gateMessage.textContent =
      error instanceof ApiError && error.status !== 0
        ? error.message
        : 'Could not reach the server. Check your connection and try again.';
    retryButton.hidden = false;
    retryButton.focus();
    return;
  }

  gate.hidden = true;
  app.hidden = false;
  userName.textContent = user.name.trim().split(/\s+/)[0] ?? user.name;
  for (const link of document.querySelectorAll<HTMLElement>('[data-admin-only]')) {
    link.hidden = user.role !== 'admin';
  }

  window.addEventListener('hashchange', () => void show(routeFromHash(user), true));
  await show(routeFromHash(user), false);
}

retryButton.addEventListener('click', () => void start());

signOutButton.addEventListener('click', async () => {
  signOutButton.disabled = true;
  await logout().catch(() => undefined); // the browser forgets the token even if the call fails
  forgetSession();
  location.replace('/index.html');
});

void start();
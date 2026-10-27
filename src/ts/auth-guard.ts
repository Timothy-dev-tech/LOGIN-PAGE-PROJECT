// Decides who may see the dashboard, and remembers (harmlessly) that someone is signed in.
import { ApiError, refresh, type PublicUser } from './api';

// The refresh cookie is httpOnly, so the page cannot tell whether it exists. This flag is only a
// HINT that lets the login page skip a pointless "am I signed in?" request. It holds no secret
// and grants nothing: the server still checks the real cookie on every refresh.
const HINT_KEY = 'hasSession';

export function rememberSession(): void {
  try {
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    // Storage unavailable (private window). The hint is optional.
  }
}

export function forgetSession(): void {
  try {
    localStorage.removeItem(HINT_KEY);
  } catch {
    // Nothing to do.
  }
}

export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Route guard for protected pages. The access token only lives in memory, so every fresh page
 * load starts without one; the refresh cookie is how we get a new one.
 *   - works            -> returns the user
 *   - server says 401  -> not signed in: go to the login page (and never return)
 *   - anything else    -> throws, so the page can offer "try again" (we may just be offline)
 */
export async function requireSession(
  redirect: (url: string) => void = (url) => location.replace(url),
): Promise<PublicUser> {
  try {
    const user = await refresh();
    rememberSession();
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      forgetSession();
      redirect('/index.html?reason=expired');
      return new Promise<PublicUser>(() => undefined); // the page is leaving; stay silent
    }
    throw error;
  }
}
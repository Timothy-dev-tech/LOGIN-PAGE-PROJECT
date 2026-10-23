// Auth settings in one place. Changing a number here changes it everywhere.

/** Access tokens are short-lived so a stolen one stops working quickly. */
export const ACCESS_TOKEN_TTL = '15m';

/** Refresh cookie: its name, and the only URL path the browser will send it to. */
export const REFRESH_COOKIE_NAME = 'refresh_token';
export const REFRESH_COOKIE_PATH = '/api/auth';

/** How long a session lasts. "Remember me" unticked = 1 day, ticked = 30 days. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const PERSISTENT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * If a refresh token that was just replaced is used again within this window we treat it
 * as two tabs racing, not as theft. After it, reuse revokes the whole session.
 */
export const REUSE_GRACE_MS = 10_000;

/** Which version of the Terms the user agreed to; update it when the terms change. */
export const TERMS_VERSION = '2026-10-13';
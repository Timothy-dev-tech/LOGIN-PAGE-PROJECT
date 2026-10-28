// The only file that talks to the server. Pages call these functions and never use fetch directly,
// so URLs, error handling and token handling live in one place.

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: string;
}

/** A failed request, with the server's machine-readable code and any per-field messages. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, code: string, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

// The access token lives only in this variable (memory). It is not in localStorage, so a script
// injected into the page cannot read it from storage, and a page reload simply asks for a new
// one using the refresh cookie.
let accessToken: string | null = null;
export const getAccessToken = (): string | null => accessToken;

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface SendOptions {
  method?: Method;
  body?: unknown;
  token?: string | null;
}

async function send<T>(path: string, { method = 'GET', body, token }: SendOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin', // send and accept the refresh cookie
    });
  } catch {
    throw new ApiError(0, 'network', 'Could not reach the server. Check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string; details?: { fieldErrors?: Record<string, string> } } } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'unknown',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details?.fieldErrors ?? {},
    );
  }
  return data as T;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  termsAccepted: boolean;
}

export async function register(input: RegisterInput): Promise<PublicUser> {
  const { user } = await send<{ user: PublicUser }>('/auth/register', { method: 'POST', body: input });
  return user;
}

/** Password correct: either you are in, or the account has 2FA and a second step is needed. */
export type LoginOutcome =
  | { kind: 'session'; user: PublicUser }
  | { kind: 'two_factor'; challengeToken: string };

export async function login(input: {
  email: string;
  password: string;
  remember: boolean;
}): Promise<LoginOutcome> {
  const result = await send<
    { accessToken: string; user: PublicUser } | { twoFactorRequired: true; challengeToken: string }
  >('/auth/login', { method: 'POST', body: input });
  if ('twoFactorRequired' in result) return { kind: 'two_factor', challengeToken: result.challengeToken };
  accessToken = result.accessToken;
  return { kind: 'session', user: result.user };
}

/** What a person types to prove the second factor: an app code OR a recovery code, never both. */
export type SecondFactor = { code: string } | { recoveryCode: string };

/** Second step of sign-in. On success the session starts, exactly as after a normal login. */
export async function verifyTwoFactor(challengeToken: string, factor: SecondFactor): Promise<PublicUser> {
  const result = await send<{ accessToken: string; user: PublicUser }>('/auth/2fa/verify', {
    method: 'POST',
    body: { challengeToken, ...factor },
  });
  accessToken = result.accessToken;
  return result.user;
}

// If several requests find the token expired at the same moment they must share ONE refresh
// call. Refresh tokens work once, so a second parallel call would look like token theft.
let refreshing: Promise<PublicUser> | null = null;

export function refresh(): Promise<PublicUser> {
  refreshing ??= send<{ accessToken: string; user: PublicUser }>('/auth/refresh', { method: 'POST' })
    .then((result) => {
      accessToken = result.accessToken;
      return result.user;
    })
    .catch((error: unknown) => {
      accessToken = null;
      throw error;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function logout(): Promise<void> {
  accessToken = null;
  await send<void>('/auth/logout', { method: 'POST' });
}

/**
 * For protected endpoints: adds the token, and if the server says it expired, refreshes once and
 * retries. Retrying is safe for every method because a 401 comes from the access-token check,
 * which runs before the request does anything.
 */
async function authed<T>(path: string, options: Omit<SendOptions, 'token'> = {}): Promise<T> {
  try {
    return await send<T>(path, { ...options, token: accessToken });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
  }
  await refresh();
  return send<T>(path, { ...options, token: accessToken });
}

export const authedGet = <T>(path: string): Promise<T> => authed<T>(path);

export async function me(): Promise<PublicUser> {
  const { user } = await authedGet<{ user: PublicUser }>('/auth/me');
  return user;
}

// ---- Study log -------------------------------------------------------------------------

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface StudyLogInput {
  topic: string;
  minutes: number;
  /** A calendar day written 2026-10-20 (not a timestamp). */
  studiedOn: string;
  notes: string;
}

export interface StudyLogEntry extends StudyLogInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

const pageQuery = (page: number, limit: number): string => `?page=${page}&limit=${limit}`;

export const listStudyLogs = (page = 1, limit = 20): Promise<Page<StudyLogEntry>> =>
  authed(`/study-logs${pageQuery(page, limit)}`);

export async function createStudyLog(input: StudyLogInput): Promise<StudyLogEntry> {
  const { entry } = await authed<{ entry: StudyLogEntry }>('/study-logs', { method: 'POST', body: input });
  return entry;
}

export async function updateStudyLog(id: string, changes: Partial<StudyLogInput>): Promise<StudyLogEntry> {
  const { entry } = await authed<{ entry: StudyLogEntry }>(`/study-logs/${id}`, {
    method: 'PATCH',
    body: changes,
  });
  return entry;
}

export const deleteStudyLog = (id: string): Promise<void> =>
  authed<void>(`/study-logs/${id}`, { method: 'DELETE' });

// ---- Devices (sessions) and activity ----------------------------------------------------

export interface DeviceSession {
  id: string;
  device: string;
  ip: string;
  startedAt: string;
  lastActiveAt: string;
  persistent: boolean;
  expiresAt: string;
  current: boolean;
}

export async function listSessions(): Promise<DeviceSession[]> {
  const { sessions } = await authed<{ sessions: DeviceSession[] }>('/auth/sessions');
  return sessions;
}

export const revokeSession = (id: string): Promise<void> =>
  authed<void>(`/auth/sessions/${id}`, { method: 'DELETE' });

export async function revokeOtherSessions(): Promise<number> {
  const { revoked } = await authed<{ revoked: number }>('/auth/sessions/others', { method: 'DELETE' });
  return revoked;
}

export type ActivityType =
  | 'register'
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'token_reuse_detected'
  | 'session_revoked'
  | 'other_sessions_revoked'
  | 'two_factor_enabled'
  | 'two_factor_disabled'
  | 'two_factor_failed'
  | 'recovery_code_used'
  | 'recovery_codes_regenerated';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  device: string;
  ip: string;
  at: string;
}

export const listActivity = (page = 1, limit = 20): Promise<Page<ActivityItem>> =>
  authed(`/auth/activity${pageQuery(page, limit)}`);

// ---- Two-factor authentication ----------------------------------------------------------

export interface TwoFactorStatus {
  enabled: boolean;
  pending: boolean;
  recoveryCodesRemaining: number;
}

export interface TwoFactorSetup {
  /** The secret as text, for typing into an app by hand. */
  secret: string;
  otpauthUri: string;
  /** A PNG drawn by the server. */
  qrDataUrl: string;
}

export const twoFactorStatus = (): Promise<TwoFactorStatus> => authed('/auth/2fa');

export const startTwoFactorSetup = (password: string): Promise<TwoFactorSetup> =>
  authed('/auth/2fa/setup', { method: 'POST', body: { password } });

/** Confirms setup with a first code. Returns the recovery codes: the only time they are ever shown. */
export async function enableTwoFactor(code: string): Promise<string[]> {
  const { recoveryCodes } = await authed<{ recoveryCodes: string[] }>('/auth/2fa/enable', {
    method: 'POST',
    body: { code },
  });
  return recoveryCodes;
}

export const disableTwoFactor = (password: string, factor: SecondFactor): Promise<void> =>
  authed<void>('/auth/2fa/disable', { method: 'POST', body: { password, ...factor } });

export async function regenerateRecoveryCodes(password: string, factor: SecondFactor): Promise<string[]> {
  const { recoveryCodes } = await authed<{ recoveryCodes: string[] }>('/auth/2fa/recovery-codes', {
    method: 'POST',
    body: { password, ...factor },
  });
  return recoveryCodes;
}

// ---- Admin ------------------------------------------------------------------------------

export const listUsers = (page = 1, limit = 20): Promise<Page<PublicUser>> =>
  authed(`/admin/users${pageQuery(page, limit)}`);
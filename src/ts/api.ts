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

interface SendOptions {
  method?: 'GET' | 'POST';
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

export async function login(input: {
  email: string;
  password: string;
  remember: boolean;
}): Promise<PublicUser> {
  const result = await send<{ accessToken: string; user: PublicUser }>('/auth/login', {
    method: 'POST',
    body: input,
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

/** For protected endpoints: adds the token, and if the server says it expired, refreshes once and retries. */
export async function authedGet<T>(path: string): Promise<T> {
  try {
    return await send<T>(path, { token: accessToken });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
  }
  await refresh();
  return send<T>(path, { token: accessToken });
}

export async function me(): Promise<PublicUser> {
  const { user } = await authedGet<{ user: PublicUser }>('/auth/me');
  return user;
}
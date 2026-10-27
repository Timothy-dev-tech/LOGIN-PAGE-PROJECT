import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';

type Reply = { status?: number; body?: unknown };
let calls: Array<{ url: string; init: RequestInit }>;
let replies: Reply[];

function json(reply: Reply): Response {
  const status = reply.status ?? 200;
  return status === 204
    ? new Response(null, { status })
    : new Response(JSON.stringify(reply.body ?? {}), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  calls = [];
  replies = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = replies.shift();
      if (!next) throw new Error(`unexpected request to ${url}`);
      return json(next);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const user = { id: '1', name: 'Tim', email: 'tim@x.com', role: 'user', createdAt: 'now' };
const headersOf = (i: number) => calls[i]?.init.headers as Record<string, string>;

describe('register', () => {
  it('posts the details and returns the user', async () => {
    replies.push({ status: 201, body: { user } });
    const input = { name: 'Tim', email: 'tim@x.com', password: 'Password123', termsAccepted: true };
    expect(await api.register(input)).toEqual(user);
    expect(calls[0]?.url).toBe('/api/auth/register');
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual(input);
  });

  it('turns a server error into an ApiError with field messages', async () => {
    replies.push({
      status: 409,
      body: { error: { code: 'email_taken', message: 'Taken.', details: { fieldErrors: { email: 'Already used' } } } },
    });
    const error = await api.register({ name: 'T', email: 'a@b.co', password: 'x', termsAccepted: true }).catch((e) => e);
    expect(error).toBeInstanceOf(api.ApiError);
    expect(error).toMatchObject({ status: 409, code: 'email_taken', fieldErrors: { email: 'Already used' } });
  });
});

describe('errors', () => {
  it('reports a network failure with a friendly ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = await api.register({ name: 'T', email: 'a@b.co', password: 'x', termsAccepted: true }).catch((e) => e);
    expect(error).toMatchObject({ status: 0, code: 'network' });
  });

  it('copes with an error response that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })));
    const error = await api.register({ name: 'T', email: 'a@b.co', password: 'x', termsAccepted: true }).catch((e) => e);
    expect(error).toMatchObject({ status: 502, code: 'unknown' });
  });
});

describe('login, tokens and refreshing', () => {
  it('keeps the access token in memory and uses it', async () => {
    replies.push({ body: { accessToken: 'token-1', user } }, { body: { user } });
    await api.login({ email: 'tim@x.com', password: 'Password123', remember: false });
    expect(api.getAccessToken()).toBe('token-1');
    await api.me();
    expect(headersOf(1).Authorization).toBe('Bearer token-1');
  });

  it('refreshes once and retries when the token has expired', async () => {
    replies.push(
      { body: { accessToken: 'old', user } }, // login
      { status: 401, body: { error: { code: 'unauthorized', message: 'x' } } }, // /me: expired
      { body: { accessToken: 'new', user } }, // /refresh
      { body: { user } }, // /me again
    );
    await api.login({ email: 'tim@x.com', password: 'Password123', remember: true });
    expect(await api.me()).toEqual(user);
    expect(calls.map((c) => c.url)).toEqual(['/api/auth/login', '/api/auth/me', '/api/auth/refresh', '/api/auth/me']);
    expect(headersOf(3).Authorization).toBe('Bearer new');
  });

  it('shares one refresh between simultaneous requests', async () => {
    replies.push(
      { body: { accessToken: 'old', user } },
      { status: 401, body: { error: { code: 'unauthorized', message: 'x' } } },
      { status: 401, body: { error: { code: 'unauthorized', message: 'x' } } },
      { body: { accessToken: 'new', user } }, // the single refresh
      { body: { user } },
      { body: { user } },
    );
    await api.login({ email: 'tim@x.com', password: 'Password123', remember: false });
    await Promise.all([api.me(), api.me()]);
    expect(calls.filter((c) => c.url === '/api/auth/refresh')).toHaveLength(1);
  });

  it('gives up, and forgets the token, when the refresh fails', async () => {
    replies.push(
      { body: { accessToken: 'old', user } },
      { status: 401, body: { error: { code: 'unauthorized', message: 'x' } } },
      { status: 401, body: { error: { code: 'invalid_refresh_token', message: 'Sign in again' } } },
    );
    await api.login({ email: 'tim@x.com', password: 'Password123', remember: false });
    const error = await api.me().catch((e) => e);
    expect(error).toMatchObject({ code: 'invalid_refresh_token' });
    expect(api.getAccessToken()).toBeNull();
  });

  it('does not refresh for errors other than 401', async () => {
    replies.push({ status: 500, body: { error: { code: 'internal_error', message: 'x' } } });
    await expect(api.me()).rejects.toMatchObject({ status: 500 });
    expect(calls).toHaveLength(1);
  });
});

describe('logout', () => {
  it('forgets the token and tells the server', async () => {
    replies.push({ body: { accessToken: 'token-1', user } }, { status: 204 });
    await api.login({ email: 'tim@x.com', password: 'Password123', remember: false });
    await api.logout();
    expect(api.getAccessToken()).toBeNull();
    expect(calls[1]?.url).toBe('/api/auth/logout');
  });
});

describe('protected endpoints for the dashboard', () => {
  const entry = { id: 'e1', topic: 'JWT', minutes: 30, studiedOn: '2026-10-20', notes: '', createdAt: 'a', updatedAt: 'b' };
  const signIn = async () => {
    replies.push({ body: { accessToken: 'tok', user } });
    await api.login({ email: 'tim@x.com', password: 'Password123', remember: false });
    calls.length = 0;
  };

  it('lists study-log entries with the page in the query string', async () => {
    await signIn();
    replies.push({ body: { items: [entry], total: 1, page: 2, limit: 5 } });
    expect(await api.listStudyLogs(2, 5)).toEqual({ items: [entry], total: 1, page: 2, limit: 5 });
    expect(calls[0]?.url).toBe('/api/study-logs?page=2&limit=5');
    expect(headersOf(0).Authorization).toBe('Bearer tok');
  });

  it('creates with POST and a JSON body, and returns the entry', async () => {
    await signIn();
    replies.push({ status: 201, body: { entry } });
    const input = { topic: 'JWT', minutes: 30, studiedOn: '2026-10-20', notes: '' };
    expect(await api.createStudyLog(input)).toEqual(entry);
    expect(calls[0]?.init.method).toBe('POST');
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual(input);
  });

  it('updates with PATCH on the entry url', async () => {
    await signIn();
    replies.push({ body: { entry: { ...entry, minutes: 90 } } });
    expect((await api.updateStudyLog('e1', { minutes: 90 })).minutes).toBe(90);
    expect(calls[0]?.url).toBe('/api/study-logs/e1');
    expect(calls[0]?.init.method).toBe('PATCH');
  });

  it('deletes with DELETE and expects no body back', async () => {
    await signIn();
    replies.push({ status: 204 });
    await expect(api.deleteStudyLog('e1')).resolves.toBeUndefined();
    expect(calls[0]?.init.method).toBe('DELETE');
  });

  it('retries a POST after refreshing when the token had expired (the 401 means nothing ran)', async () => {
    await signIn();
    replies.push(
      { status: 401, body: { error: { code: 'unauthorized', message: 'x' } } },
      { body: { accessToken: 'fresh', user } },
      { status: 201, body: { entry } },
    );
    await api.createStudyLog({ topic: 'JWT', minutes: 30, studiedOn: '2026-10-20', notes: '' });
    expect(calls.map((c) => c.url)).toEqual(['/api/study-logs', '/api/auth/refresh', '/api/study-logs']);
    expect(headersOf(2).Authorization).toBe('Bearer fresh');
  });

  it('lists devices, signs one out and signs out the others', async () => {
    await signIn();
    const session = { id: 's1', device: 'Chrome on Windows', ip: '1.2.3.4', startedAt: 'a', lastActiveAt: 'b', persistent: false, expiresAt: 'c', current: true };
    replies.push({ body: { sessions: [session] } }, { status: 204 }, { body: { revoked: 3 } });
    expect(await api.listSessions()).toEqual([session]);
    await api.revokeSession('s1');
    expect(await api.revokeOtherSessions()).toBe(3);
    expect(calls.map((c) => `${c.init.method ?? 'GET'} ${c.url}`)).toEqual([
      'GET /api/auth/sessions',
      'DELETE /api/auth/sessions/s1',
      'DELETE /api/auth/sessions/others',
    ]);
  });

  it('reads activity and the admin user list', async () => {
    await signIn();
    replies.push({ body: { items: [], total: 0, page: 1, limit: 20 } }, { body: { items: [user], total: 1, page: 1, limit: 20 } });
    await api.listActivity();
    expect((await api.listUsers()).items).toEqual([user]);
    expect(calls.map((c) => c.url)).toEqual(['/api/auth/activity?page=1&limit=20', '/api/admin/users?page=1&limit=20']);
  });
});
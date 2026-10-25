import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { REFRESH_COOKIE_NAME, REUSE_GRACE_MS } from './config/auth.js';
import { Activity } from './models/activity.model.js';
import { Session } from './models/session.model.js';
import { clearTestDb, disconnectTestDb } from './test/db.js';
import { bearer, makeApp, password, prepareDb } from './test/api.js';

const app = makeApp();
const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

beforeAll(() => prepareDb('login_page_account'));
beforeEach(clearTestDb);
afterAll(disconnectTestDb);

const cookieOf = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`))!;
const cookieValue = (res: request.Response) => cookieOf(res).split(';')[0]!; // "refresh_token=abc"

async function register(email: string, name = 'Test Person') {
  await request(app).post('/api/auth/register').send({ name, email, password, termsAccepted: true });
}
/** Signs in "from" a device. Returns the access token, the cookie to send back, and the id. */
async function signInFrom(email: string, userAgent: string, remember = false) {
  const res = await request(app).post('/api/auth/login').set('User-Agent', userAgent).send({ email, password, remember });
  return { res, access: res.body.accessToken as string, cookie: cookieValue(res), userId: res.body.user.id as string };
}
const listSessions = (access: string, cookie?: string) => {
  const req = request(app).get('/api/auth/sessions').set(bearer(access));
  return cookie ? req.set('Cookie', cookie) : req;
};

describe('authentication on the account routes', () => {
  it('answers 401 without a token', async () => {
    const calls = [
      request(app).get('/api/auth/sessions'),
      request(app).delete('/api/auth/sessions/others'),
      request(app).delete('/api/auth/sessions/0123456789abcdef'),
      request(app).get('/api/auth/activity'),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/sessions', () => {
  it('lists one row per device and marks the one asking', async () => {
    await register('tim@example.com');
    const laptop = await signInFrom('tim@example.com', CHROME_WIN);
    const phone = await signInFrom('tim@example.com', SAFARI_IOS, true);

    const res = await listSessions(laptop.access, laptop.cookie);
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(2);
    const byDevice = Object.fromEntries(res.body.sessions.map((s: { device: string }) => [s.device, s]));
    expect(byDevice['Chrome on Windows']).toMatchObject({ current: true, persistent: false });
    expect(byDevice['Safari on iOS']).toMatchObject({ current: false, persistent: true });

    // from the phone's point of view it is the other way round
    const fromPhone = await listSessions(phone.access, phone.cookie);
    const current = fromPhone.body.sessions.filter((s: { current: boolean }) => s.current);
    expect(current).toHaveLength(1);
    expect(current[0].device).toBe('Safari on iOS');
  });

  it('marks nothing as current when no cookie is sent', async () => {
    await register('tim@example.com');
    const laptop = await signInFrom('tim@example.com', CHROME_WIN);
    const res = await listSessions(laptop.access);
    expect(res.body.sessions.every((s: { current: boolean }) => !s.current)).toBe(true);
  });

  it('shows only my sessions', async () => {
    await register('tim@example.com');
    await register('ann@example.com', 'Ann Wanjiru');
    const tim = await signInFrom('tim@example.com', CHROME_WIN);
    await signInFrom('ann@example.com', SAFARI_IOS);
    const res = await listSessions(tim.access, tim.cookie);
    expect(res.body.sessions).toHaveLength(1);
  });

  it('keeps one row per device after a refresh, with the same start time', async () => {
    await register('tim@example.com');
    const laptop = await signInFrom('tim@example.com', CHROME_WIN, true);
    const before = (await listSessions(laptop.access, laptop.cookie)).body.sessions[0];

    await new Promise((r) => setTimeout(r, 20));
    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', laptop.cookie);
    expect(refreshed.status).toBe(200);
    // "remember me" survives the rotation: still a 30-day cookie
    expect(cookieOf(refreshed)).toMatch(/Max-Age=2592000/);

    const after = (await listSessions(refreshed.body.accessToken, cookieValue(refreshed))).body.sessions;
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: before.id, current: true, persistent: true });
    expect(after[0].startedAt).toBe(before.startedAt);
    expect(new Date(after[0].lastActiveAt).getTime()).toBeGreaterThan(new Date(before.lastActiveAt).getTime());
  });

  it('never exposes tokens or hashes', async () => {
    await register('tim@example.com');
    const laptop = await signInFrom('tim@example.com', CHROME_WIN);
    const res = await listSessions(laptop.access, laptop.cookie);
    expect(JSON.stringify(res.body).toLowerCase()).not.toMatch(/tokenhash|refresh_token/);
  });
});

describe('DELETE /api/auth/sessions/:familyId', () => {
  it('signs one device out and leaves the others signed in', async () => {
    await register('tim@example.com');
    const laptop = await signInFrom('tim@example.com', CHROME_WIN);
    const phone = await signInFrom('tim@example.com', SAFARI_IOS);
    const phoneId = (await listSessions(laptop.access, laptop.cookie)).body.sessions.find(
      (s: { device: string }) => s.device === 'Safari on iOS',
    ).id as string;

    const del = await request(app).delete(`/api/auth/sessions/${phoneId}`).set(bearer(laptop.access));
    expect(del.status).toBe(204);

    expect((await request(app).post('/api/auth/refresh').set('Cookie', phone.cookie)).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', laptop.cookie)).status).toBe(200);
  });

  it('answers 404 for another person\'s session, and does not end it', async () => {
    await register('tim@example.com');
    await register('ann@example.com', 'Ann Wanjiru');
    const tim = await signInFrom('tim@example.com', CHROME_WIN);
    const ann = await signInFrom('ann@example.com', SAFARI_IOS);
    const annId = (await listSessions(ann.access, ann.cookie)).body.sessions[0].id as string;

    const res = await request(app).delete(`/api/auth/sessions/${annId}`).set(bearer(tim.access));
    expect(res.status).toBe(404);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', ann.cookie)).status).toBe(200);
  });

  it('answers 404 for a malformed or unknown id', async () => {
    await register('tim@example.com');
    const tim = await signInFrom('tim@example.com', CHROME_WIN);
    for (const id of ['abc', '123', '00000000-0000-4000-8000-000000000000']) {
      const res = await request(app).delete(`/api/auth/sessions/${id}`).set(bearer(tim.access));
      expect(res.status).toBe(404);
    }
  });
});

describe('DELETE /api/auth/sessions/others', () => {
  it('signs out every other device but keeps this one', async () => {
    await register('tim@example.com');
    const laptop = await signInFrom('tim@example.com', CHROME_WIN);
    const phone = await signInFrom('tim@example.com', SAFARI_IOS);
    const tablet = await signInFrom('tim@example.com', SAFARI_IOS);

    const res = await request(app).delete('/api/auth/sessions/others').set(bearer(laptop.access)).set('Cookie', laptop.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ revoked: 2 });

    expect((await request(app).post('/api/auth/refresh').set('Cookie', phone.cookie)).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', tablet.cookie)).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', laptop.cookie)).status).toBe(200);
  });

  it('answers 400 when it cannot tell which device is current (and revokes nothing)', async () => {
    await register('tim@example.com');
    const laptop = await signInFrom('tim@example.com', CHROME_WIN);
    const res = await request(app).delete('/api/auth/sessions/others').set(bearer(laptop.access));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('no_current_session');
    expect(await Session.countDocuments({ usedAt: null })).toBe(1);
  });

  it('refuses to use someone else\'s cookie as "this device"', async () => {
    await register('tim@example.com');
    await register('ann@example.com', 'Ann Wanjiru');
    const tim = await signInFrom('tim@example.com', CHROME_WIN);
    const ann = await signInFrom('ann@example.com', SAFARI_IOS);
    const res = await request(app).delete('/api/auth/sessions/others').set(bearer(tim.access)).set('Cookie', ann.cookie);
    expect(res.status).toBe(400);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', tim.cookie)).status).toBe(200);
  });

  it('reports 0 when there is nothing else to sign out', async () => {
    await register('tim@example.com');
    const laptop = await signInFrom('tim@example.com', CHROME_WIN);
    const res = await request(app).delete('/api/auth/sessions/others').set(bearer(laptop.access)).set('Cookie', laptop.cookie);
    expect(res.body).toEqual({ revoked: 0 });
  });
});

describe('GET /api/auth/activity', () => {
  const types = async (access: string, query = '') =>
    ((await request(app).get(`/api/auth/activity${query}`).set(bearer(access))).body.items as { type: string }[]).map((i) => i.type);

  it('records register, failed login, login and logout, newest first', async () => {
    await register('tim@example.com');
    await request(app).post('/api/auth/login').send({ email: 'tim@example.com', password: 'Wrong-password1' });
    const laptop = await signInFrom('tim@example.com', CHROME_WIN);
    await request(app).post('/api/auth/logout').set('Cookie', laptop.cookie);
    const again = await signInFrom('tim@example.com', CHROME_WIN);

    expect(await types(again.access)).toEqual(['login', 'logout', 'login', 'login_failed', 'register']);
  });

  it('describes the device and records the address', async () => {
    await register('tim@example.com');
    const laptop = await signInFrom('tim@example.com', CHROME_WIN);
    const res = await request(app).get('/api/auth/activity').set(bearer(laptop.access));
    expect(res.body.items[0]).toMatchObject({ type: 'login', device: 'Chrome on Windows' });
    expect(res.body.items[0].ip).toBeTypeOf('string');
    expect(JSON.stringify(res.body)).not.toMatch(/userAgent|Mozilla/);
  });

  it('does not log a failed login for an email that has no account', async () => {
    await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password });
    expect(await Activity.countDocuments()).toBe(0);
  });

  it('shows only my activity', async () => {
    await register('tim@example.com');
    await register('ann@example.com', 'Ann Wanjiru');
    const tim = await signInFrom('tim@example.com', CHROME_WIN);
    await signInFrom('ann@example.com', SAFARI_IOS);
    expect(await types(tim.access)).toEqual(['login', 'register']);
  });

  it('records revoking sessions', async () => {
    await register('tim@example.com');
    const laptop = await signInFrom('tim@example.com', CHROME_WIN);
    await signInFrom('tim@example.com', SAFARI_IOS);
    const phoneId = (await listSessions(laptop.access, laptop.cookie)).body.sessions.find((s: { current: boolean }) => !s.current).id;
    await request(app).delete(`/api/auth/sessions/${phoneId}`).set(bearer(laptop.access));
    await signInFrom('tim@example.com', SAFARI_IOS);
    await request(app).delete('/api/auth/sessions/others').set(bearer(laptop.access)).set('Cookie', laptop.cookie);
    const list = await types(laptop.access);
    expect(list).toContain('session_revoked');
    expect(list[0]).toBe('other_sessions_revoked');
  });

  it('records stolen-token detection', async () => {
    await register('tim@example.com');
    const laptop = await signInFrom('tim@example.com', CHROME_WIN);
    const first = await request(app).post('/api/auth/refresh').set('Cookie', laptop.cookie);
    // pretend the old token was used a minute ago, well past the grace window
    await Session.updateMany({ usedAt: { $ne: null } }, { usedAt: new Date(Date.now() - REUSE_GRACE_MS - 50_000) });
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', laptop.cookie);
    expect(replay.status).toBe(401);

    // the whole session is gone, so sign in again to look at the log
    const fresh = await signInFrom('tim@example.com', CHROME_WIN);
    expect(first.status).toBe(200);
    expect(await types(fresh.access)).toContain('token_reuse_detected');
  });

  it('paginates and rejects bad paging', async () => {
    await register('tim@example.com');
    const tim = await signInFrom('tim@example.com', CHROME_WIN);
    const page = await request(app).get('/api/auth/activity?limit=1&page=2').set(bearer(tim.access));
    expect(page.body.items).toHaveLength(1);
    expect(page.body.total).toBe(2);
    expect((await request(app).get('/api/auth/activity?limit=0').set(bearer(tim.access))).status).toBe(400);
  });

  it('a failing log write never breaks signing in', async () => {
    await register('tim@example.com');
    const original = Activity.create.bind(Activity);
    (Activity as unknown as { create: unknown }).create = () => Promise.reject(new Error('disk full'));
    try {
      const res = await request(app).post('/api/auth/login').send({ email: 'tim@example.com', password });
      expect(res.status).toBe(200);
    } finally {
      (Activity as unknown as { create: unknown }).create = original;
    }
  });
});
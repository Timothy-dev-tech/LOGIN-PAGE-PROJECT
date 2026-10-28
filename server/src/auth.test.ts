import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { REFRESH_COOKIE_NAME } from './config/auth.js';
import { Session } from './models/session.model.js';
import { User } from './models/user.model.js';
import { clearTestDb, connectTestDb, disconnectTestDb } from './test/db.js';

const origin = 'http://localhost:5173';
const secret = 'test-secret-'.repeat(4);
const env = { nodeEnv: 'test' as const, clientOrigin: origin, jwtAccessSecret: secret, bcryptCost: 4, twoFactorKey: Buffer.alloc(32, 1) };
const app = createApp(env, {
  loginLimit: { windowMs: 60_000, max: 1000 },
  registerLimit: { windowMs: 60_000, max: 1000 },
});

const tim = { name: 'Tim Sol', email: 'tim@example.com', password: 'Password123', termsAccepted: true };

beforeAll(async () => {
  await connectTestDb('login_page_test');
  await User.init(); // make sure the unique indexes exist before the tests rely on them
  // Servers that imitate MongoDB (used for TEST_MONGODB_URI in some setups) may not support
  // the expiry (TTL) index. Real MongoDB and mongodb-memory-server do, so there it must work.
  await Session.init().catch((err: unknown) => {
    if (!process.env.TEST_MONGODB_URI) throw err;
  });
});
beforeEach(clearTestDb);
afterAll(disconnectTestDb);

const register = (body: object = tim) => request(app).post('/api/auth/register').send(body);
const login = (body: object = { email: tim.email, password: tim.password }) =>
  request(app).post('/api/auth/login').send(body);

/** Pulls the refresh token value out of a Set-Cookie header. */
function refreshCookieOf(res: request.Response): string {
  const header = (res.headers['set-cookie'] as unknown as string[] | undefined)?.find((c) =>
    c.startsWith(`${REFRESH_COOKIE_NAME}=`),
  );
  if (!header) throw new Error('no refresh cookie in response');
  return header.split(';')[0]!.split('=')[1]!;
}
const setCookieOf = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`))!;
const refresh = (token: string) =>
  request(app).post('/api/auth/refresh').set('Cookie', `${REFRESH_COOKIE_NAME}=${token}`);

async function signedIn(remember = false) {
  await register();
  const res = await login({ email: tim.email, password: tim.password, remember });
  return { res, access: res.body.accessToken as string, refreshToken: refreshCookieOf(res) };
}

describe('POST /api/auth/register', () => {
  it('creates the account and answers 201 without any secrets', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Tim Sol', email: 'tim@example.com', role: 'user' });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
    expect(res.headers['set-cookie']).toBeUndefined(); // registering does not sign you in
  });

  it('stores a bcrypt hash, never the password', async () => {
    await register();
    const saved = await User.findOne({ email: tim.email }).select('+passwordHash');
    expect(saved?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(saved?.passwordHash).not.toContain(tim.password);
    expect(saved?.termsVersion).toBeTruthy();
  });

  it('ignores a role sent in the request (mass assignment)', async () => {
    const res = await register({ ...tim, role: 'admin', isAdmin: true });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('user');
    expect((await User.findOne({ email: tim.email }))?.role).toBe('user');
  });

  it('rejects bad input with a field-by-field 400', async () => {
    const res = await register({ name: '1', email: 'nope', password: 'short', termsAccepted: false });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
    expect(Object.keys(res.body.error.details.fieldErrors).sort()).toEqual(
      ['email', 'name', 'password', 'termsAccepted'],
    );
  });

  it('rejects values that are not text', async () => {
    const res = await register({ ...tim, email: { $gt: '' }, password: ['x'] });
    expect(res.status).toBe(400);
  });

  it('rejects a body that is not an object', async () => {
    const res = await request(app).post('/api/auth/register').send([1, 2]);
    expect(res.status).toBe(400);
  });

  it('answers 409 for a duplicate email, whatever the letter case', async () => {
    await register();
    const res = await register({ ...tim, email: 'TIM@Example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('email_taken');
    expect(await User.countDocuments()).toBe(1);
  });

  it('lets only one of two simultaneous sign-ups win', async () => {
    const results = await Promise.all([register(), register()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });
});

describe('POST /api/auth/login', () => {
  it('signs in: access token in the body, refresh token in an httpOnly cookie', async () => {
    const { res } = await signedIn();
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(tim.email);
    expect(jwt.verify(res.body.accessToken, secret)).toMatchObject({ role: 'user' });
    const cookie = setCookieOf(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(JSON.stringify(res.body)).not.toContain(refreshCookieOf(res)); // never in the body
  });

  it('stores only a hash of the refresh token', async () => {
    const { refreshToken } = await signedIn();
    const stored = await Session.find();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).not.toBe(refreshToken);
    expect(JSON.stringify(stored)).not.toContain(refreshToken);
  });

  it('without "remember me" the cookie is a session cookie; with it, it lasts 30 days', async () => {
    const short = await signedIn(false);
    expect(setCookieOf(short.res)).not.toMatch(/Max-Age|Expires/i);
    await clearTestDb();
    const long = await signedIn(true);
    expect(setCookieOf(long.res)).toMatch(/Max-Age=2592000/);
  });

  it('is secure-only in production', async () => {
    const prod = createApp({ ...env, nodeEnv: 'production' });
    await register();
    const res = await request(prod).post('/api/auth/login').send({ email: tim.email, password: tim.password });
    expect(setCookieOf(res)).toMatch(/Secure/i);
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    await register();
    const wrongPassword = await login({ email: tim.email, password: 'Wrong-password1' });
    const unknownEmail = await login({ email: 'nobody@example.com', password: 'Whatever123' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.code).toBe('invalid_credentials');
  });

  it('accepts the email in any letter case', async () => {
    await register();
    expect((await login({ email: 'TIM@EXAMPLE.COM', password: tim.password })).status).toBe(200);
  });

  it('answers 400 when fields are missing', async () => {
    expect((await login({})).status).toBe(400);
  });

  it('starts a separate session for each login', async () => {
    await register();
    await login();
    await login();
    expect(new Set((await Session.find()).map((s) => s.familyId)).size).toBe(2);
  });

  it('blocks repeated failures with 429, but not successes', async () => {
    const limited = createApp(env, { loginLimit: { windowMs: 60_000, max: 3 } });
    await register();
    const bad = () => request(limited).post('/api/auth/login').send({ email: tim.email, password: 'Wrong-password1' });
    for (let i = 0; i < 3; i++) expect((await bad()).status).toBe(401);
    const blocked = await bad();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('too_many_requests');
    // Correct password is blocked too while the limit is active.
    const good = await request(limited).post('/api/auth/login').send({ email: tim.email, password: tim.password });
    expect(good.status).toBe(429);
  });
});

describe('GET /api/auth/me (protected route)', () => {
  it('rejects a request with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('rejects a bad, forged or expired token', async () => {
    await register();
    const id = (await User.findOne())!.id as string;
    const forged = jwt.sign({ role: 'admin' }, 'wrong-secret'.repeat(4), { subject: id });
    const expired = jwt.sign({ role: 'user' }, secret, { subject: id, expiresIn: -5 });
    for (const header of ['Bearer nonsense', `Bearer ${forged}`, `Bearer ${expired}`, 'Basic abc', 'Bearer']) {
      expect((await request(app).get('/api/auth/me').set('Authorization', header)).status).toBe(401);
    }
  });

  it('returns the signed-in user', async () => {
    const { access } = await signedIn();
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${access}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(tim.email);
  });

  it('rejects a valid token whose user no longer exists', async () => {
    const { access } = await signedIn();
    await User.deleteMany({});
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${access}`)).status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('rejects a request with no cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_refresh_token');
  });

  it('rejects an unknown token', async () => {
    expect((await refresh('made-up-token')).status).toBe(401);
  });

  it('swaps the token for a new one and issues a working access token', async () => {
    const { refreshToken } = await signedIn();
    const res = await refresh(refreshToken);
    expect(res.status).toBe(200);
    const next = refreshCookieOf(res);
    expect(next).not.toBe(refreshToken);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(await Session.countDocuments()).toBe(2); // the used one is kept so reuse can be detected
  });

  it('keeps the same session family and the "remember me" choice', async () => {
    const { refreshToken } = await signedIn(true);
    const res = await refresh(refreshToken);
    expect(setCookieOf(res)).toMatch(/Max-Age=2592000/);
    expect(new Set((await Session.find()).map((s) => s.familyId)).size).toBe(1);
  });

  // This relies on MongoDB updating one document atomically, which real MongoDB guarantees.
  // Some look-alike servers do not, so it can be switched off with SKIP_ATOMICITY_TESTS=1.
  it.skipIf(process.env.SKIP_ATOMICITY_TESTS === '1')('lets only one of two simultaneous refreshes win', async () => {
    const { refreshToken } = await signedIn();
    const results = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('does not end the session when a just-used token is replayed within the grace window', async () => {
    const { refreshToken } = await signedIn();
    const first = await refresh(refreshToken);
    expect((await refresh(refreshToken)).status).toBe(401); // replay straight away (two tabs)
    const stillWorks = await refresh(refreshCookieOf(first));
    expect(stillWorks.status).toBe(200);
  });

  it('ends the whole session when an old token is replayed after the grace window (theft)', async () => {
    const { refreshToken } = await signedIn();
    const first = await refresh(refreshToken);
    const newest = refreshCookieOf(first);

    // Pretend the first rotation happened a minute ago.
    await Session.updateOne({ tokenHash: { $exists: true }, usedAt: { $ne: null } }, { usedAt: new Date(Date.now() - 60_000) });

    expect((await refresh(refreshToken)).status).toBe(401); // the thief replays the old token
    expect(await Session.countDocuments()).toBe(0); // the whole family is gone
    expect((await refresh(newest)).status).toBe(401); // so the real user is signed out too
  });

  it('does not touch other devices when one session is revoked', async () => {
    await register();
    const phone = refreshCookieOf(await login());
    const laptop = refreshCookieOf(await login());
    const rotated = await refresh(phone);
    await Session.updateOne({ usedAt: { $ne: null } }, { usedAt: new Date(Date.now() - 60_000) });
    await refresh(phone); // theft on the phone session
    expect(rotated.status).toBe(200);
    expect((await refresh(laptop)).status).toBe(200);
  });

  it('rejects an expired token', async () => {
    const { refreshToken } = await signedIn();
    await Session.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await refresh(refreshToken)).status).toBe(401);
  });

  it('refuses a request that comes from another website (CSRF)', async () => {
    const { refreshToken } = await signedIn();
    const res = await refresh(refreshToken).set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden_origin');
    expect((await refresh(refreshToken).set('Origin', origin)).status).toBe(200);
  });
});

describe('POST /api/auth/logout', () => {
  it('ends the session and clears the cookie', async () => {
    const { refreshToken } = await signedIn();
    const res = await request(app).post('/api/auth/logout').set('Cookie', `${REFRESH_COOKIE_NAME}=${refreshToken}`);
    expect(res.status).toBe(204);
    expect(setCookieOf(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(await Session.countDocuments()).toBe(0);
    expect((await refresh(refreshToken)).status).toBe(401);
  });

  it('only ends the session it was called for', async () => {
    await register();
    const phone = refreshCookieOf(await login());
    const laptop = refreshCookieOf(await login());
    await request(app).post('/api/auth/logout').set('Cookie', `${REFRESH_COOKIE_NAME}=${phone}`);
    expect((await refresh(laptop)).status).toBe(200);
  });

  it('is fine to call when already signed out', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(204);
  });

  it('refuses a request from another website', async () => {
    expect((await request(app).post('/api/auth/logout').set('Origin', 'https://evil.example')).status).toBe(403);
  });
});

describe('database', () => {
  it('is connected for these tests', () => {
    expect(mongoose.connection.readyState).toBe(1);
  });
});
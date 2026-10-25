import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { REFRESH_COOKIE_NAME } from './config/auth.js';
import { requireRole } from './middleware/require-role.js';
import { Session } from './models/session.model.js';
import { User } from './models/user.model.js';
import { clearTestDb, disconnectTestDb } from './test/db.js';
import { HttpError } from './utils/http-error.js';
import { bearer, makeApp, password, prepareDb, secret } from './test/api.js';

const app = makeApp();

beforeAll(() => prepareDb('login_page_edge_cases'));
beforeEach(clearTestDb);
afterAll(disconnectTestDb);

describe('access tokens that are signed correctly but still wrong', () => {
  // These are tokens the server's own secret really signed. They prove the checks on the
  // CONTENT of a token, not just its signature.
  const sign = (payload: object, options: jwt.SignOptions = {}) =>
    jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '5m', ...options });

  it('refuses a role that is neither user nor admin', async () => {
    const token = sign({ role: 'superuser' }, { subject: '0123456789abcdef01234567' });
    expect((await request(app).get('/api/auth/me').set(bearer(token))).status).toBe(401);
  });

  it('refuses a token with no subject (no user id)', async () => {
    const token = sign({ role: 'user' });
    expect((await request(app).get('/api/auth/me').set(bearer(token))).status).toBe(401);
  });

  it('refuses a token signed with the right secret but another algorithm (HS512)', async () => {
    const token = sign({ role: 'user' }, { subject: '0123456789abcdef01234567', algorithm: 'HS512' });
    expect((await request(app).get('/api/auth/me').set(bearer(token))).status).toBe(401);
  });

  it('refuses a token that has expired', async () => {
    const token = sign({ role: 'user' }, { subject: '0123456789abcdef01234567', expiresIn: -60 });
    expect((await request(app).get('/api/auth/me').set(bearer(token))).status).toBe(401);
  });
});

describe('POST /api/auth/refresh when the account has been deleted', () => {
  it('answers 401 and removes the whole session', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Tim Sol', email: 'tim@example.com', password, termsAccepted: true });
    const login = await request(app).post('/api/auth/login').send({ email: 'tim@example.com', password });
    const timId = login.body.user.id as string;
    const cookie = (login.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`))!
      .split(';')[0]!;
    expect(await Session.countDocuments({ user: timId })).toBeGreaterThan(0);

    await User.deleteOne({ _id: timId });
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_refresh_token');
    expect(await Session.countDocuments({ user: timId })).toBe(0);
  });
});

describe('requireRole used without requireAuth in front of it', () => {
  it('answers 401 instead of crashing', async () => {
    const next = vi.fn();
    await requireRole('admin')({} as never, {} as never, next);
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0]![0] as HttpError;
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(401);
  });
});
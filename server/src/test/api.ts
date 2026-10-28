import request from 'supertest';
import { createApp } from '../app.js';
import { Session } from '../models/session.model.js';
import { User } from '../models/user.model.js';
import { connectTestDb } from './db.js';

export const secret = 'test-secret-'.repeat(4);
export const twoFactorKey = Buffer.alloc(32, 9);
export const password = 'Password123';

/** An app with the rate limits turned way up so tests never trip them. */
export function makeApp() {
  return createApp(
    { nodeEnv: 'test', clientOrigin: 'http://localhost:5173', jwtAccessSecret: secret, bcryptCost: 4, twoFactorKey },
    { loginLimit: { windowMs: 60_000, max: 1000 }, registerLimit: { windowMs: 60_000, max: 1000 }, twoFactorLimit: { windowMs: 60_000, max: 1000 } },
  );
}

/** Connects to the test database and makes sure the indexes the tests rely on exist. */
export async function prepareDb(name: string): Promise<void> {
  await connectTestDb(name);
  await User.init();
  await Session.init().catch((err: unknown) => {
    if (!process.env.TEST_MONGODB_URI) throw err;
  });
}

/** Registers and logs in a normal user. Returns their access token and id. */
export async function signUp(app: ReturnType<typeof makeApp>, email: string, name = 'Test Person') {
  await request(app).post('/api/auth/register').send({ name, email, password, termsAccepted: true });
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return { access: res.body.accessToken as string, id: res.body.user.id as string };
}

/** Signs in an existing account (used after seedAdmin made one). */
export async function signIn(app: ReturnType<typeof makeApp>, email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return { access: res.body.accessToken as string, id: res.body.user.id as string };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedAdmin } from './services/admin.service.js';
import { User } from './models/user.model.js';
import { clearTestDb, disconnectTestDb } from './test/db.js';
import { bearer, makeApp, password, prepareDb, signIn, signUp } from './test/api.js';

const app = makeApp();

beforeAll(() => prepareDb('login_page_rbac'));
beforeEach(clearTestDb);
afterAll(disconnectTestDb);

const admin = { name: 'Site Admin', email: 'admin@example.com', password };
async function adminToken() {
  await seedAdmin(admin, 4);
  return (await signIn(app, admin.email)).access;
}

describe('GET /api/admin/users', () => {
  it('answers 401 without a token', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });

  it('answers 403 for a normal user', async () => {
    const tim = await signUp(app, 'tim@example.com');
    const res = await request(app).get('/api/admin/users').set(bearer(tim.access));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('lets an admin list users, without hashes', async () => {
    await signUp(app, 'tim@example.com');
    const token = await adminToken();
    const res = await request(app).get('/api/admin/users').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((u: { email: string }) => u.email).sort()).toEqual(['admin@example.com', 'tim@example.com']);
    expect(JSON.stringify(res.body).toLowerCase()).not.toMatch(/hash|password/);
  });

  it('paginates and rejects bad paging', async () => {
    await signUp(app, 'a@example.com');
    await signUp(app, 'b@example.com');
    const token = await adminToken();
    const res = await request(app).get('/api/admin/users?limit=2').set(bearer(token));
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(3);
    expect((await request(app).get('/api/admin/users?limit=0').set(bearer(token))).status).toBe(400);
  });

  it('stops working the moment the admin is demoted, even with an unexpired token', async () => {
    const token = await adminToken();
    expect((await request(app).get('/api/admin/users').set(bearer(token))).status).toBe(200);
    await User.updateOne({ email: admin.email }, { role: 'user' });
    expect((await request(app).get('/api/admin/users').set(bearer(token))).status).toBe(403);
  });

  it('answers 401 if the admin account was deleted', async () => {
    const token = await adminToken();
    await User.deleteOne({ email: admin.email });
    expect((await request(app).get('/api/admin/users').set(bearer(token))).status).toBe(401);
  });

  it('cannot be reached by registering with role: admin', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Sneaky', email: 's@example.com', password, termsAccepted: true, role: 'admin' });
    expect(res.body.user.role).toBe('user');
    const login = await request(app).post('/api/auth/login').send({ email: 's@example.com', password });
    expect((await request(app).get('/api/admin/users').set(bearer(login.body.accessToken))).status).toBe(403);
  });
});

describe('seedAdmin', () => {
  it('creates an admin who can sign in, with the password stored only as a hash', async () => {
    const result = await seedAdmin(admin, 4);
    expect(result.action).toBe('created');
    expect(result.user.role).toBe('admin');
    const stored = await User.findOne({ email: admin.email }).select('+passwordHash');
    expect(stored?.passwordHash).not.toContain(password);
    expect((await signIn(app, admin.email)).id).toBe(result.user.id);
  });

  it('promotes an existing user and keeps their password', async () => {
    await signUp(app, 'tim@example.com');
    const result = await seedAdmin({ name: 'Tim Sol', email: 'TIM@example.com', password: 'Different123' }, 4);
    expect(result.action).toBe('promoted');
    expect((await User.findOne({ email: 'tim@example.com' }))?.role).toBe('admin');
    // the OLD password still works, the one in the seed call was ignored
    expect((await signIn(app, 'tim@example.com')).access).toBeTruthy();
  });

  it('is safe to run twice', async () => {
    await seedAdmin(admin, 4);
    const again = await seedAdmin(admin, 4);
    expect(again.action).toBe('unchanged');
    expect(await User.countDocuments()).toBe(1);
  });

  it('refuses a weak password or a bad email', async () => {
    await expect(seedAdmin({ ...admin, password: 'short' }, 4)).rejects.toThrow(/Password/);
    await expect(seedAdmin({ ...admin, email: 'nope' }, 4)).rejects.toThrow(/email/i);
    expect(await User.countDocuments()).toBe(0);
  });
});
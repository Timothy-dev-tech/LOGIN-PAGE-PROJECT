import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StudyLog } from './models/study-log.model.js';
import { clearTestDb, disconnectTestDb } from './test/db.js';
import { bearer, makeApp, prepareDb, signUp } from './test/api.js';

const app = makeApp();
const entry = { topic: 'Express middleware', minutes: 45, studiedOn: '2026-10-20', notes: 'Read the docs' };

beforeAll(() => prepareDb('login_page_study_logs'));
beforeEach(clearTestDb);
afterAll(disconnectTestDb);

const create = (token: string, body: object = entry) =>
  request(app).post('/api/study-logs').set(bearer(token)).send(body);

describe('study log: authentication', () => {
  it('answers 401 on every route without a token', async () => {
    const id = '0123456789abcdef01234567';
    const calls = [
      request(app).get('/api/study-logs'),
      request(app).post('/api/study-logs').send(entry),
      request(app).get(`/api/study-logs/${id}`),
      request(app).patch(`/api/study-logs/${id}`).send({ minutes: 5 }),
      request(app).delete(`/api/study-logs/${id}`),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('unauthorized');
    }
  });
});

describe('POST /api/study-logs', () => {
  it('creates an entry owned by the caller and answers 201', async () => {
    const tim = await signUp(app, 'tim@example.com');
    const res = await create(tim.access);
    expect(res.status).toBe(201);
    expect(res.body.entry).toMatchObject(entry);
    expect(res.body.entry.id).toMatch(/^[0-9a-f]{24}$/);
    const stored = await StudyLog.findById(res.body.entry.id);
    expect(String(stored?.user)).toBe(tim.id);
  });

  it('ignores a "user" field in the body (cannot create entries for someone else)', async () => {
    const tim = await signUp(app, 'tim@example.com');
    const ann = await signUp(app, 'ann@example.com', 'Ann Wanjiru');
    const res = await create(tim.access, { ...entry, user: ann.id });
    expect(res.status).toBe(201);
    expect(String((await StudyLog.findById(res.body.entry.id))?.user)).toBe(tim.id);
  });

  it('answers 400 with per-field messages for bad input', async () => {
    const tim = await signUp(app, 'tim@example.com');
    const res = await create(tim.access, { topic: 'x', minutes: '30', studiedOn: '2999-01-01' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fieldErrors).sort()).toEqual(['minutes', 'studiedOn', 'topic']);
  });
});

describe('GET /api/study-logs', () => {
  it('lists only my entries, newest day first', async () => {
    const tim = await signUp(app, 'tim@example.com');
    const ann = await signUp(app, 'ann@example.com', 'Ann Wanjiru');
    await create(tim.access, { ...entry, topic: 'Older', studiedOn: '2026-10-01' });
    await create(tim.access, { ...entry, topic: 'Newer', studiedOn: '2026-10-22' });
    await create(ann.access, { ...entry, topic: 'Not mine' });
    const res = await request(app).get('/api/study-logs').set(bearer(tim.access));
    expect(res.status).toBe(200);
    expect(res.body.items.map((e: { topic: string }) => e.topic)).toEqual(['Newer', 'Older']);
    expect(res.body).toMatchObject({ total: 2, page: 1, limit: 20 });
  });

  it('paginates', async () => {
    const tim = await signUp(app, 'tim@example.com');
    for (const day of ['01', '02', '03']) await create(tim.access, { ...entry, topic: `Day ${day}`, studiedOn: `2026-10-${day}` });
    const res = await request(app).get('/api/study-logs?page=2&limit=2').set(bearer(tim.access));
    expect(res.body.items.map((e: { topic: string }) => e.topic)).toEqual(['Day 01']);
    expect(res.body.total).toBe(3);
  });

  it('answers 400 for a bad page', async () => {
    const tim = await signUp(app, 'tim@example.com');
    const res = await request(app).get('/api/study-logs?page=0').set(bearer(tim.access));
    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors).toHaveProperty('page');
  });
});

describe('GET / PATCH / DELETE /api/study-logs/:id', () => {
  it('reads, partly updates and deletes my own entry', async () => {
    const tim = await signUp(app, 'tim@example.com');
    const id = (await create(tim.access)).body.entry.id as string;

    const read = await request(app).get(`/api/study-logs/${id}`).set(bearer(tim.access));
    expect(read.status).toBe(200);
    expect(read.body.entry.topic).toBe(entry.topic);

    const patched = await request(app).patch(`/api/study-logs/${id}`).set(bearer(tim.access)).send({ minutes: 90 });
    expect(patched.status).toBe(200);
    expect(patched.body.entry).toMatchObject({ ...entry, minutes: 90 }); // the rest is untouched

    const del = await request(app).delete(`/api/study-logs/${id}`).set(bearer(tim.access));
    expect(del.status).toBe(204);
    const gone = await request(app).get(`/api/study-logs/${id}`).set(bearer(tim.access));
    expect(gone.status).toBe(404);
  });

  it('answers 404 (not 403) for someone else\'s entry, on every method', async () => {
    const tim = await signUp(app, 'tim@example.com');
    const ann = await signUp(app, 'ann@example.com', 'Ann Wanjiru');
    const id = (await create(ann.access)).body.entry.id as string;
    const url = `/api/study-logs/${id}`;

    expect((await request(app).get(url).set(bearer(tim.access))).status).toBe(404);
    expect((await request(app).patch(url).set(bearer(tim.access)).send({ minutes: 1 })).status).toBe(404);
    expect((await request(app).delete(url).set(bearer(tim.access))).status).toBe(404);

    // and Ann's entry is untouched
    const still = await StudyLog.findById(id);
    expect(still?.minutes).toBe(entry.minutes);
  });

  it('answers 404 for a malformed or unknown id', async () => {
    const tim = await signUp(app, 'tim@example.com');
    for (const id of ['abc', '123', 'not-an-object-id-at-all!!', '0123456789abcdef01234567']) {
      const res = await request(app).get(`/api/study-logs/${id}`).set(bearer(tim.access));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    }
  });

  it('refuses an empty or invalid patch with 400', async () => {
    const tim = await signUp(app, 'tim@example.com');
    const id = (await create(tim.access)).body.entry.id as string;
    const empty = await request(app).patch(`/api/study-logs/${id}`).set(bearer(tim.access)).send({});
    expect(empty.status).toBe(400);
    const bad = await request(app).patch(`/api/study-logs/${id}`).set(bearer(tim.access)).send({ minutes: 0 });
    expect(bad.status).toBe(400);
  });

  it('cannot move an entry to another owner with PATCH', async () => {
    const tim = await signUp(app, 'tim@example.com');
    const ann = await signUp(app, 'ann@example.com', 'Ann Wanjiru');
    const id = (await create(tim.access)).body.entry.id as string;
    await request(app).patch(`/api/study-logs/${id}`).set(bearer(tim.access)).send({ minutes: 10, user: ann.id });
    expect(String((await StudyLog.findById(id))?.user)).toBe(tim.id);
  });
});
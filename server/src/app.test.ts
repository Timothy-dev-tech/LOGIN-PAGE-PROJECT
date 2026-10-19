import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { errorHandler } from './middleware/error-handler.js';
import { HttpError } from './utils/http-error.js';

const origin = 'http://localhost:5173';
const app = createApp({ nodeEnv: 'test', clientOrigin: origin });

describe('health check', () => {
  it('answers 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('disconnected'); // no database in this test
  });
});

describe('security headers and CORS', () => {
  it('sets helmet headers and hides the framework', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows the configured frontend origin, with credentials', async () => {
    const res = await request(app).get('/api/health').set('Origin', origin);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not allow other origins', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('error handling', () => {
  it('answers unknown routes with a JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('answers malformed JSON with a JSON 400', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_json');
  });

  it('answers an oversized body with 413', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ big: 'x'.repeat(20_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('payload_too_large');
  });
});

describe('errorHandler', () => {
  const log = vi.spyOn(console, 'error');
  beforeEach(() => log.mockImplementation(() => {}));
  afterEach(() => log.mockReset());

  function appThatThrows(error: unknown) {
    const a = express();
    a.get('/boom', () => {
      throw error;
    });
    a.use(errorHandler);
    return a;
  }

  it('turns an HttpError into its status, code and details', async () => {
    const res = await request(appThatThrows(new HttpError(409, 'email_taken', 'Taken.', { field: 'email' }))).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'email_taken', message: 'Taken.', details: { field: 'email' } } });
  });

  it('hides the message of unexpected errors', async () => {
    const res = await request(appThatThrows(new Error('database password is hunter2'))).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('internal_error');
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(log).toHaveBeenCalled();
  });
});
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const valid = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/test',
  CLIENT_ORIGIN: 'http://localhost:5173',
};

describe('loadEnv', () => {
  it('reads valid values', () => {
    expect(loadEnv({ ...valid, NODE_ENV: 'production', PORT: '8080' })).toEqual({
      nodeEnv: 'production',
      port: 8080,
      mongoUri: valid.MONGODB_URI,
      clientOrigin: valid.CLIENT_ORIGIN,
    });
  });

  it('uses development and port 4000 by default', () => {
    const env = loadEnv(valid);
    expect(env.nodeEnv).toBe('development');
    expect(env.port).toBe(4000);
  });

  it('accepts a mongodb+srv Atlas string', () => {
    expect(() => loadEnv({ ...valid, MONGODB_URI: 'mongodb+srv://u:p@cluster.mongodb.net/db' })).not.toThrow();
  });

  it('rejects a missing MONGODB_URI', () => {
    expect(() => loadEnv({ CLIENT_ORIGIN: valid.CLIENT_ORIGIN })).toThrow(/MONGODB_URI/);
  });

  it('rejects a MONGODB_URI that is not a mongodb URL', () => {
    expect(() => loadEnv({ ...valid, MONGODB_URI: 'postgres://x' })).toThrow(/MONGODB_URI/);
  });

  it('rejects a bad PORT', () => {
    expect(() => loadEnv({ ...valid, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadEnv({ ...valid, PORT: '4000.5' })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnv({ ...valid, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('rejects a CLIENT_ORIGIN with a path or trailing slash, or none at all', () => {
    expect(() => loadEnv({ ...valid, CLIENT_ORIGIN: 'http://localhost:5173/' })).toThrow(/CLIENT_ORIGIN/);
    expect(() => loadEnv({ ...valid, CLIENT_ORIGIN: 'http://localhost:5173/app' })).toThrow(/CLIENT_ORIGIN/);
    expect(() => loadEnv({ MONGODB_URI: valid.MONGODB_URI })).toThrow(/CLIENT_ORIGIN/);
  });

  it('reports every problem at once', () => {
    expect(() => loadEnv({})).toThrow(/MONGODB_URI[\s\S]*CLIENT_ORIGIN/);
  });
});
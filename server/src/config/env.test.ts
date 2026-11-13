import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const valid = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/test',
  CLIENT_ORIGIN: 'http://localhost:5173',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  TWO_FACTOR_KEY: Buffer.alloc(32, 7).toString('base64'),
};

describe('loadEnv', () => {
  it('reads valid values', () => {
    expect(loadEnv({ ...valid, NODE_ENV: 'production', PORT: '8080' })).toEqual({
      nodeEnv: 'production',
      port: 8080,
      mongoUri: valid.MONGODB_URI,
      clientOrigin: valid.CLIENT_ORIGIN,
      jwtAccessSecret: valid.JWT_ACCESS_SECRET,
      bcryptCost: 12,
      twoFactorKey: Buffer.alloc(32, 7),
      trustProxyHops: 1,
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

  it('rejects a missing or short JWT_ACCESS_SECRET', () => {
    const { JWT_ACCESS_SECRET: _omit, ...withoutSecret } = valid;
    expect(() => loadEnv(withoutSecret)).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => loadEnv({ ...valid, JWT_ACCESS_SECRET: 'too-short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('checks BCRYPT_COST', () => {
    expect(loadEnv({ ...valid, BCRYPT_COST: '10' }).bcryptCost).toBe(10);
    expect(() => loadEnv({ ...valid, BCRYPT_COST: '3' })).toThrow(/BCRYPT_COST/);
    expect(() => loadEnv({ ...valid, BCRYPT_COST: 'x' })).toThrow(/BCRYPT_COST/);
  });

  it('reports every problem at once', () => {
    expect(() => loadEnv({})).toThrow(/MONGODB_URI[\s\S]*CLIENT_ORIGIN/);
  });

  it('rejects a missing or wrong-sized TWO_FACTOR_KEY', () => {
    const { TWO_FACTOR_KEY: _omit, ...without } = valid;
    expect(() => loadEnv(without)).toThrow(/TWO_FACTOR_KEY/);
    expect(() => loadEnv({ ...valid, TWO_FACTOR_KEY: Buffer.alloc(16).toString('base64') })).toThrow(/TWO_FACTOR_KEY/);
    expect(() => loadEnv({ ...valid, TWO_FACTOR_KEY: 'not base64 at all!!' })).toThrow(/TWO_FACTOR_KEY/);
  });

  it('reads TRUST_PROXY_HOPS, defaulting to 1, and rejects nonsense', () => {
    expect(loadEnv({ ...valid, TRUST_PROXY_HOPS: '2' }).trustProxyHops).toBe(2);
    expect(loadEnv(valid).trustProxyHops).toBe(1);
    for (const bad of ['-1', '6', 'two', '1.5']) {
      expect(() => loadEnv({ ...valid, TRUST_PROXY_HOPS: bad })).toThrow(/TRUST_PROXY_HOPS/);
    }
  });
});
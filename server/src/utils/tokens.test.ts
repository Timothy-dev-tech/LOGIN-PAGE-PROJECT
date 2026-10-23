import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { generateRefreshToken, hashToken, signAccessToken, verifyAccessToken } from './tokens.js';

const secret = 's'.repeat(40);
const payload = { userId: '65f000000000000000000001', role: 'user' as const };

describe('access tokens', () => {
  it('can be signed and verified', () => {
    expect(verifyAccessToken(signAccessToken(payload, secret), secret)).toEqual(payload);
  });

  it('is rejected with the wrong secret', () => {
    expect(verifyAccessToken(signAccessToken(payload, secret), 'z'.repeat(40))).toBeNull();
  });

  it('is rejected when it has been tampered with', () => {
    const [header, body, signature] = signAccessToken(payload, secret).split('.');
    const forgedBody = Buffer.from(JSON.stringify({ sub: payload.userId, role: 'admin' })).toString('base64url');
    expect(verifyAccessToken(`${header}.${forgedBody}.${signature}`, secret)).toBeNull();
    expect(body).toBeTruthy();
  });

  it('is rejected when it has expired', () => {
    const expired = jwt.sign({ role: 'user' }, secret, { subject: payload.userId, expiresIn: -10 });
    expect(verifyAccessToken(expired, secret)).toBeNull();
  });

  it('refuses the "none" algorithm', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: payload.userId, role: 'admin' })).toString('base64url');
    expect(verifyAccessToken(`${header}.${body}.`, secret)).toBeNull();
  });

  it('refuses a token with an unknown role', () => {
    const odd = jwt.sign({ role: 'root' }, secret, { subject: payload.userId });
    expect(verifyAccessToken(odd, secret)).toBeNull();
  });

  it('refuses garbage', () => {
    expect(verifyAccessToken('not-a-token', secret)).toBeNull();
    expect(verifyAccessToken('', secret)).toBeNull();
  });
});

describe('refresh tokens', () => {
  it('are long and different every time', () => {
    const a = generateRefreshToken();
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(generateRefreshToken()).not.toBe(a);
  });

  it('hash to the same value every time, and never to the token itself', () => {
    const token = generateRefreshToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});
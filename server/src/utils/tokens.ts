import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ACCESS_TOKEN_TTL } from '../config/auth.js';
import type { Role } from '../models/user.model.js';

export interface AccessTokenPayload {
  userId: string;
  role: Role;
}

export function signAccessToken(payload: AccessTokenPayload, secret: string): string {
  // `sub` ("subject") is the standard JWT field for who the token is about.
  // The algorithm is pinned so a token can never pick a weaker one.
  return jwt.sign({ role: payload.role }, secret, {
    subject: payload.userId,
    expiresIn: ACCESS_TOKEN_TTL,
    algorithm: 'HS256',
  });
}

/** Returns the payload, or null if the token is missing, forged, malformed or expired. */
export function verifyAccessToken(token: string, secret: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') return null;
    if (decoded.role !== 'user' && decoded.role !== 'admin') return null;
    return { userId: decoded.sub, role: decoded.role };
  } catch {
    return null;
  }
}

// The short-lived pass handed out after a correct password when 2FA is on. It proves "step 1
// done" and nothing else. It has no `role` claim and a different audience, so it can never be
// used as an access token, and an access token can never be used as one of these.
const CHALLENGE_AUDIENCE = '2fa-challenge';
export const CHALLENGE_TTL = '5m';

export interface ChallengePayload {
  userId: string;
  remember: boolean;
}

export function signChallengeToken(payload: ChallengePayload, secret: string): string {
  return jwt.sign({ remember: payload.remember }, secret, {
    subject: payload.userId,
    audience: CHALLENGE_AUDIENCE,
    expiresIn: CHALLENGE_TTL,
    algorithm: 'HS256',
  });
}

export function verifyChallengeToken(token: string, secret: string): ChallengePayload | null {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'], audience: CHALLENGE_AUDIENCE });
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') return null;
    return { userId: decoded.sub, remember: decoded.remember === true };
  } catch {
    return null;
  }
}

/** A random, unguessable value for the cookie: 32 bytes = 256 bits. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * What we store in the database. SHA-256 is enough here (unlike for passwords) because the
 * input is already 256 bits of randomness, so there is nothing to guess.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
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
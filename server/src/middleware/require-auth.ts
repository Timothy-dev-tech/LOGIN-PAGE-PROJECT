import type { RequestHandler } from 'express';
import { HttpError } from '../utils/http-error.js';
import { verifyAccessToken } from '../utils/tokens.js';

/**
 * Protects a route. Reads "Authorization: Bearer <access token>", checks the signature and
 * expiry, and puts who the caller is on `req.auth`. Everything after it can trust req.auth.
 */
export function requireAuth(jwtAccessSecret: string): RequestHandler {
  return (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    const payload = scheme === 'Bearer' && token ? verifyAccessToken(token, jwtAccessSecret) : null;
    if (!payload) {
      next(new HttpError(401, 'unauthorized', 'Please sign in.'));
      return;
    }
    req.auth = payload;
    next();
  };
}
import type { RequestHandler } from 'express';
import { HttpError } from '../utils/http-error.js';

/**
 * Extra protection for routes that act on the refresh cookie (refresh, logout).
 * Browsers attach the cookie automatically, so a malicious site could try to trigger these
 * calls. Browsers always say which site a POST came from in the Origin header, and it cannot
 * be faked from a web page, so we reject any POST that comes from somewhere else.
 * (A request with no Origin header is not from a browser page, so it has no cookie to abuse.)
 */
export function requireSameOrigin(clientOrigin: string): RequestHandler {
  return (req, _res, next) => {
    const origin = req.get('origin');
    if (origin !== undefined && origin !== clientOrigin) {
      next(new HttpError(403, 'forbidden_origin', 'This request is not allowed from here.'));
      return;
    }
    next();
  };
}
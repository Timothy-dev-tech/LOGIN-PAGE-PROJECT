import type { RequestHandler } from 'express';
import { User, type Role } from '../models/user.model.js';
import { HttpError } from '../utils/http-error.js';

/**
 * Lets a request through only if the caller currently has one of `roles`. Put it AFTER
 * requireAuth, which is what fills in req.auth.
 *
 * The role inside the access token is up to 15 minutes old, so we do not trust it for this
 * decision. We read the role from the database instead. One extra lookup per admin request
 * is cheap, and it means that demoting or deleting an admin takes effect immediately
 * instead of when their token expires.
 *
 *   401 = we do not know who you are.   403 = we know who you are, and the answer is no.
 */
export function requireRole(...roles: Role[]): RequestHandler {
  return async (req, _res, next) => {
    if (!req.auth) {
      next(new HttpError(401, 'unauthorized', 'Please sign in.'));
      return;
    }
    const user = await User.findById(req.auth.userId).select('role');
    if (!user) {
      next(new HttpError(401, 'unauthorized', 'Please sign in.'));
      return;
    }
    if (!roles.includes(user.role)) {
      next(new HttpError(403, 'forbidden', 'You do not have permission to do that.'));
      return;
    }
    next();
  };
}
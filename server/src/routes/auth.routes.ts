import { Router } from 'express';
import { createAuthController, type AuthControllerOptions } from '../controllers/auth.controller.js';
import { createRateLimiter, type LimitOptions } from '../middleware/rate-limit.js';
import { requireAuth } from '../middleware/require-auth.js';
import { requireSameOrigin } from '../middleware/require-same-origin.js';

export interface AuthRouterOptions extends AuthControllerOptions {
  clientOrigin: string;
  loginLimit: LimitOptions;
  registerLimit: LimitOptions;
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  const router = Router();
  const controller = createAuthController(options);
  const sameOrigin = requireSameOrigin(options.clientOrigin);

  // Only failed logins count toward the limit, so normal users never hit it.
  router.post('/register', createRateLimiter(options.registerLimit), controller.register);
  router.post('/login', createRateLimiter(options.loginLimit, true), controller.login);
  router.post('/refresh', sameOrigin, controller.refresh);
  router.post('/logout', sameOrigin, controller.logout);
  router.get('/me', requireAuth(options.jwtAccessSecret), controller.me);

  return router;
}
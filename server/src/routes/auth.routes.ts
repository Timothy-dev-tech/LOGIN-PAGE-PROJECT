import { Router } from 'express';
import { createAccountController } from '../controllers/account.controller.js';
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
  const account = createAccountController();
  const auth = requireAuth(options.jwtAccessSecret);
  const sameOrigin = requireSameOrigin(options.clientOrigin);

  // Only failed logins count toward the limit, so normal users never hit it.
  router.post('/register', createRateLimiter(options.registerLimit), controller.register);
  router.post('/login', createRateLimiter(options.loginLimit, true), controller.login);
  router.post('/refresh', sameOrigin, controller.refresh);
  router.post('/logout', sameOrigin, controller.logout);
  router.get('/me', auth, controller.me);

  // Your devices and your activity. These use the Bearer token, so a foreign website cannot
  // call them. They live under /api/auth on purpose: the browser only sends the refresh
  // cookie to that path, and "which device am I on?" needs the cookie.
  router.get('/sessions', auth, account.sessions);
  router.delete('/sessions/others', auth, account.revokeOthers); // before /:familyId, or "others" would be read as an id
  router.delete('/sessions/:familyId', auth, account.revokeOne);
  router.get('/activity', auth, account.activity);

  return router;
}
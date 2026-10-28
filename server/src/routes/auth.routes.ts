import { Router } from 'express';
import { createAccountController } from '../controllers/account.controller.js';
import { createAuthController, type AuthControllerOptions } from '../controllers/auth.controller.js';
import { createTwoFactorController } from '../controllers/two-factor.controller.js';
import { createRateLimiter, type LimitOptions } from '../middleware/rate-limit.js';
import { requireAuth } from '../middleware/require-auth.js';
import { requireSameOrigin } from '../middleware/require-same-origin.js';

export interface AuthRouterOptions extends AuthControllerOptions {
  clientOrigin: string;
  loginLimit: LimitOptions;
  registerLimit: LimitOptions;
  twoFactorLimit: LimitOptions;
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  const router = Router();
  const controller = createAuthController(options);
  const account = createAccountController();
  const twoFactor = createTwoFactorController(options);
  const auth = requireAuth(options.jwtAccessSecret);
  const sameOrigin = requireSameOrigin(options.clientOrigin);

  // Only failed logins count toward the limit, so normal users never hit it.
  router.post('/register', createRateLimiter(options.registerLimit), controller.register);
  router.post('/login', createRateLimiter(options.loginLimit, true), controller.login);
  // Second step of sign-in, and the 2FA settings. One shared limiter, counting only failures
  // (wrong codes or passwords), on top of the per-account lockout in the service.
  const twoFactorLimiter = createRateLimiter(options.twoFactorLimit, true);
  router.post('/2fa/verify', twoFactorLimiter, controller.verifyTwoFactor);
  router.get('/2fa', auth, twoFactor.status);
  router.post('/2fa/setup', auth, twoFactorLimiter, twoFactor.setup);
  router.post('/2fa/enable', auth, twoFactorLimiter, twoFactor.enable);
  router.post('/2fa/disable', auth, twoFactorLimiter, twoFactor.turnOff);
  router.post('/2fa/recovery-codes', auth, twoFactorLimiter, twoFactor.newRecoveryCodes);

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
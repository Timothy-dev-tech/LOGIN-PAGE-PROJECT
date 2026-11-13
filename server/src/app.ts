import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { Env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import type { LimitOptions } from './middleware/rate-limit.js';
import { healthRouter } from './routes/health.js';
import { createStudyLogRouter } from './routes/study-log.routes.js';

/**
 * Builds the Express app without starting it or touching the database. Keeping this
 * separate from server.ts is what lets the tests call the API without opening a port.
 */
export interface AppOptions {
  /** Failed logins allowed per IP per window. Tests pass a small number. */
  loginLimit?: LimitOptions;
  registerLimit?: LimitOptions;
  /** Failed second-factor attempts (codes, passwords on 2FA routes) allowed per IP per window. */
  twoFactorLimit?: LimitOptions;
}

export function createApp(
  env: Pick<Env, 'nodeEnv' | 'clientOrigin' | 'jwtAccessSecret' | 'bcryptCost' | 'twoFactorKey'> &
    Partial<Pick<Env, 'trustProxyHops'>>,
  options: AppOptions = {},
) {
  const app = express();

  // In production the app sits behind proxies (Render, and Vercel's rewrite in front of it).
  // Trusting exactly the right number of hops makes req.ip the real visitor's address, which
  // the rate limiters and the Devices page rely on. Too few hops: every visitor shares the
  // proxy's address and one person's failed logins lock everyone out. Too many: a visitor
  // could fake their address with an X-Forwarded-For header.
  if (env.nodeEnv === 'production') app.set('trust proxy', env.trustProxyHops ?? 1);

  // Order matters: security headers first, then CORS, then body parsing, then routes.
  app.use(helmet());
  // An array (even of one) makes cors answer only to a matching Origin; a bare string would
  // send the allowed origin back to every caller.
  app.use(cors({ origin: [env.clientOrigin], credentials: true }));
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  app.use('/api/health', healthRouter);
  app.use(
    '/api/auth',
    createAuthRouter({
      jwtAccessSecret: env.jwtAccessSecret,
      bcryptCost: env.bcryptCost,
      twoFactorKey: env.twoFactorKey,
      clientOrigin: env.clientOrigin,
      secureCookies: env.nodeEnv === 'production',
      loginLimit: options.loginLimit ?? { windowMs: 15 * 60 * 1000, max: 10 },
      registerLimit: options.registerLimit ?? { windowMs: 60 * 60 * 1000, max: 20 },
      twoFactorLimit: options.twoFactorLimit ?? { windowMs: 15 * 60 * 1000, max: 10 },
    }),
  );

  app.use('/api/study-logs', createStudyLogRouter(env.jwtAccessSecret));
  app.use('/api/admin', createAdminRouter(env.jwtAccessSecret));

  // These two must come last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
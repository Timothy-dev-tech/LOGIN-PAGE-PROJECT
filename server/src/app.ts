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
}

export function createApp(
  env: Pick<Env, 'nodeEnv' | 'clientOrigin' | 'jwtAccessSecret' | 'bcryptCost'>,
  options: AppOptions = {},
) {
  const app = express();

  // On Render/Vercel the app sits behind a proxy. Trusting one hop makes req.ip the real
  // client address, which the login rate limiter will need later.
  if (env.nodeEnv === 'production') app.set('trust proxy', 1);

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
      clientOrigin: env.clientOrigin,
      secureCookies: env.nodeEnv === 'production',
      loginLimit: options.loginLimit ?? { windowMs: 15 * 60 * 1000, max: 10 },
      registerLimit: options.registerLimit ?? { windowMs: 60 * 60 * 1000, max: 20 },
    }),
  );

  app.use('/api/study-logs', createStudyLogRouter(env.jwtAccessSecret));
  app.use('/api/admin', createAdminRouter(env.jwtAccessSecret));

  // These two must come last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
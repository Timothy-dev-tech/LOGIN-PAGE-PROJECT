import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { Env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { healthRouter } from './routes/health.js';

/**
 * Builds the Express app without starting it or touching the database. Keeping this
 * separate from server.ts is what lets the tests call the API without opening a port.
 */
export function createApp(env: Pick<Env, 'nodeEnv' | 'clientOrigin'>) {
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

  // These two must come last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
import { Router } from 'express';
import mongoose from 'mongoose';

export const healthRouter = Router();

/** Lets us (and the hosting platform) check the API is up and whether the database is connected. */
healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { connectDb, disconnectDb } from './db.js';

async function main() {
  const env = loadEnv();
  await connectDb(env.mongoUri);

  const app = createApp(env);
  const server = app.listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  // Close connections cleanly when the platform or Ctrl+C asks us to stop.
  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(() => {
      void disconnectDb().then(() => process.exit(0));
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
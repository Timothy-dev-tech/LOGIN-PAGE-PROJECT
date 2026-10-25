// Creates (or promotes) the first admin. Run it once against your database:
//   npm run seed:admin
// Credentials come from environment variables, never from command-line arguments, because
// arguments end up in shell history and process lists.
import { loadEnv } from '../config/env.js';
import { connectDb, disconnectDb } from '../db.js';
import { seedAdmin } from '../services/admin.service.js';

async function main() {
  const env = loadEnv();
  const email = process.env.ADMIN_EMAIL ?? '';
  const password = process.env.ADMIN_PASSWORD ?? '';
  const name = process.env.ADMIN_NAME ?? 'Admin';
  if (!email || !password) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (and optionally ADMIN_NAME) in server/.env');
  }

  await connectDb(env.mongoUri);
  try {
    const { action, user } = await seedAdmin({ name, email, password }, env.bcryptCost);
    const verb = { created: 'Created admin', promoted: 'Promoted to admin', unchanged: 'Already an admin' }[action];
    console.log(`${verb}: ${user.email}`); // never print the password
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
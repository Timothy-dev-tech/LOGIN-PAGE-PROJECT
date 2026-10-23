import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let memory: MongoMemoryServer | undefined;

/**
 * Connects mongoose to a throwaway database for the tests.
 * By default it starts MongoDB in memory (nothing to install; the first run downloads a
 * MongoDB binary). Set TEST_MONGODB_URI to use an existing server instead, for example a
 * service container in CI.
 */
export async function connectTestDb(name: string): Promise<void> {
  const base = process.env.TEST_MONGODB_URI;
  if (base) {
    const url = new URL(base);
    url.pathname = `/${name}`;
    await mongoose.connect(url.toString());
  } else {
    memory = await MongoMemoryServer.create();
    await mongoose.connect(memory.getUri(name));
  }
}

export async function clearTestDb(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

export async function disconnectTestDb(): Promise<void> {
  if (process.env.TEST_MONGODB_URI) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await memory?.stop();
}
import bcrypt from 'bcryptjs';

export function hashPassword(password: string, cost: number): Promise<string> {
  return bcrypt.hash(password, cost);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * A real bcrypt hash of a throwaway password, made once per cost. When a login names an
 * email that does not exist we still compare against it, so "no such user" takes as long
 * as "wrong password" and the response time does not reveal which emails are registered.
 */
const dummyHashes = new Map<number, string>();
export async function burnTime(password: string, cost: number): Promise<void> {
  let hash = dummyHashes.get(cost);
  if (!hash) {
    hash = await bcrypt.hash('not-a-real-password', cost);
    dummyHashes.set(cost, hash);
  }
  await bcrypt.compare(password, hash);
}
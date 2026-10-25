import { TERMS_VERSION } from '../config/auth.js';
import { toPublicUser, User, type PublicUser } from '../models/user.model.js';
import { hashPassword } from '../utils/password.js';
import type { Page } from './study-log.service.js';
import type { Pagination } from '../validation/pagination.js';
import {
  normalizeEmail,
  normalizeName,
  validateEmail,
  validateName,
  validatePassword,
} from '../validation/validators.js';

export async function listUsers({ page, limit }: Pagination): Promise<Page<PublicUser>> {
  const [docs, total] = await Promise.all([
    User.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(),
  ]);
  return { items: docs.map(toPublicUser), total, page, limit };
}

export interface SeedAdminInput {
  name: string;
  email: string;
  password: string;
}

export type SeedAdminResult =
  | { action: 'created' | 'promoted' | 'unchanged'; user: PublicUser };

/**
 * Makes sure an admin exists. This is the ONLY way to get one: the register endpoint can
 * never set a role. Safe to run twice.
 *   - no such email   -> creates the account as an admin
 *   - email exists    -> promotes it to admin, leaving its password alone
 *   - already admin   -> changes nothing
 */
export async function seedAdmin(input: SeedAdminInput, bcryptCost: number): Promise<SeedAdminResult> {
  const checks = [
    validateName(input.name),
    validateEmail(input.email),
    validatePassword(input.password),
  ];
  const bad = checks.find((c) => !c.valid);
  if (bad && !bad.valid) throw new Error(bad.message);

  const email = normalizeEmail(input.email);
  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role === 'admin') return { action: 'unchanged', user: toPublicUser(existing) };
    existing.role = 'admin';
    await existing.save();
    return { action: 'promoted', user: toPublicUser(existing) };
  }

  const user = await User.create({
    name: normalizeName(input.name),
    email,
    passwordHash: await hashPassword(input.password, bcryptCost),
    role: 'admin',
    // The model requires these. An admin made by the owner is treated as having accepted.
    termsAcceptedAt: new Date(),
    termsVersion: TERMS_VERSION,
  });
  return { action: 'created', user: toPublicUser(user) };
}
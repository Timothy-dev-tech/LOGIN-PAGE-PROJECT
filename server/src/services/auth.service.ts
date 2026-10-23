import { randomUUID } from 'node:crypto';
import {
  PERSISTENT_SESSION_TTL_MS,
  REUSE_GRACE_MS,
  SESSION_TTL_MS,
  TERMS_VERSION,
} from '../config/auth.js';
import { Session } from '../models/session.model.js';
import { toPublicUser, User, type PublicUser } from '../models/user.model.js';
import type { LoginInput, RegisterInput } from '../validation/auth.js';
import { HttpError } from '../utils/http-error.js';
import { burnTime, hashPassword, verifyPassword } from '../utils/password.js';
import { generateRefreshToken, hashToken, signAccessToken } from '../utils/tokens.js';

export interface AuthConfig {
  jwtAccessSecret: string;
  bcryptCost: number;
}

/** What we remember about the device, for the "your sessions" page later. */
export interface RequestMeta {
  userAgent: string;
  ip: string;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  persistent: boolean;
  user: PublicUser;
}

const invalidCredentials = () =>
  new HttpError(401, 'invalid_credentials', 'Incorrect email or password.');
const invalidRefresh = () =>
  new HttpError(401, 'invalid_refresh_token', 'Your session has ended. Please sign in again.');

export async function registerUser(input: RegisterInput, config: AuthConfig): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password, config.bcryptCost);
  try {
    const user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash,
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
    });
    return toPublicUser(user);
  } catch (err) {
    // 11000 is MongoDB's "duplicate key" code. Relying on the unique index, instead of
    // checking first, is what keeps two simultaneous sign-ups from both succeeding.
    if ((err as { code?: number }).code === 11000) {
      throw new HttpError(409, 'email_taken', 'An account with this email already exists.', {
        fieldErrors: { email: 'An account with this email already exists' },
      });
    }
    throw err;
  }
}

/** Saves a new refresh token for a session (family) and signs an access token to go with it. */
async function issueSession(
  user: { id: string; role: 'user' | 'admin' } & Parameters<typeof toPublicUser>[0],
  familyId: string,
  persistent: boolean,
  meta: RequestMeta,
  config: AuthConfig,
): Promise<IssuedSession> {
  const refreshToken = generateRefreshToken();
  const ttl = persistent ? PERSISTENT_SESSION_TTL_MS : SESSION_TTL_MS;
  await Session.create({
    user: user.id,
    familyId,
    tokenHash: hashToken(refreshToken),
    persistent,
    userAgent: meta.userAgent,
    ip: meta.ip,
    expiresAt: new Date(Date.now() + ttl),
  });
  return {
    accessToken: signAccessToken({ userId: user.id, role: user.role }, config.jwtAccessSecret),
    refreshToken,
    persistent,
    user: toPublicUser(user),
  };
}

export async function loginUser(
  input: LoginInput,
  meta: RequestMeta,
  config: AuthConfig,
): Promise<IssuedSession> {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  if (!user) {
    await burnTime(input.password, config.bcryptCost);
    throw invalidCredentials();
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) throw invalidCredentials();
  // A new login starts a new family, so each device has its own session.
  return issueSession(user, randomUUID(), input.remember, meta, config);
}

/**
 * Swaps a refresh token for a new one ("rotation").
 *
 * Each token works once. If an already-used token shows up again, either two tabs raced
 * (harmless) or someone copied the cookie (theft). We cannot tell which, so after a short
 * grace window we end the whole session: both the thief and the real user must sign in again.
 */
export async function refreshSession(
  rawToken: string,
  meta: RequestMeta,
  config: AuthConfig,
): Promise<IssuedSession> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  // One atomic step: find the unused, unexpired token AND mark it used. Two requests with
  // the same token cannot both win, because the second no longer matches `usedAt: null`.
  const claimed = await Session.findOneAndUpdate(
    { tokenHash, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
  );

  if (!claimed) {
    const known = await Session.findOne({ tokenHash });
    if (known?.usedAt && now.getTime() - known.usedAt.getTime() > REUSE_GRACE_MS) {
      await Session.deleteMany({ familyId: known.familyId });
    }
    throw invalidRefresh();
  }

  const user = await User.findById(claimed.user);
  if (!user) {
    await Session.deleteMany({ familyId: claimed.familyId });
    throw invalidRefresh();
  }
  return issueSession(user, claimed.familyId, claimed.persistent, meta, config);
}

/** Ends the session this token belongs to. Safe to call with an unknown or missing token. */
export async function endSession(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const session = await Session.findOne({ tokenHash: hashToken(rawToken) });
  if (session) await Session.deleteMany({ familyId: session.familyId });
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await User.findById(userId);
  if (!user) throw new HttpError(401, 'unauthorized', 'Please sign in.');
  return toPublicUser(user);
}
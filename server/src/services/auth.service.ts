import { randomUUID } from 'node:crypto';
import {
  PERSISTENT_SESSION_TTL_MS,
  REUSE_GRACE_MS,
  SESSION_TTL_MS,
  TERMS_VERSION,
} from '../config/auth.js';
import { Session } from '../models/session.model.js';
import { TwoFactor } from '../models/two-factor.model.js';
import { recordActivity } from './activity.service.js';
import { toPublicUser, User, type PublicUser } from '../models/user.model.js';
import type { LoginInput, RegisterInput } from '../validation/auth.js';
import { HttpError } from '../utils/http-error.js';
import { burnTime, hashPassword, verifyPassword } from '../utils/password.js';
import { generateRefreshToken, hashToken, signAccessToken, signChallengeToken } from '../utils/tokens.js';

export interface AuthConfig {
  jwtAccessSecret: string;
  bcryptCost: number;
  /** Encrypts 2FA secrets at rest. */
  twoFactorKey: Buffer;
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

/** What a password-correct login leads to: a session, or a request for the second factor. */
export type LoginResult =
  | { kind: 'session'; issued: IssuedSession }
  | { kind: 'two_factor_required'; challengeToken: string };

const NO_META: RequestMeta = { userAgent: '', ip: '' };

const invalidCredentials = () =>
  new HttpError(401, 'invalid_credentials', 'Incorrect email or password.');
const invalidRefresh = () =>
  new HttpError(401, 'invalid_refresh_token', 'Your session has ended. Please sign in again.');

export async function registerUser(
  input: RegisterInput,
  config: AuthConfig,
  meta: RequestMeta = NO_META,
): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password, config.bcryptCost);
  try {
    const user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash,
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
    });
    await recordActivity(user.id, 'register', meta);
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
export async function issueSession(
  user: { id: string; role: 'user' | 'admin' } & Parameters<typeof toPublicUser>[0],
  familyId: string,
  persistent: boolean,
  meta: RequestMeta,
  config: AuthConfig,
  startedAt: Date,
): Promise<IssuedSession> {
  const refreshToken = generateRefreshToken();
  const ttl = persistent ? PERSISTENT_SESSION_TTL_MS : SESSION_TTL_MS;
  await Session.create({
    user: user.id,
    familyId,
    tokenHash: hashToken(refreshToken),
    persistent,
    familyStartedAt: startedAt,
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
): Promise<LoginResult> {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  if (!user) {
    await burnTime(input.password, config.bcryptCost);
    throw invalidCredentials();
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    await recordActivity(user.id, 'login_failed', meta);
    throw invalidCredentials();
  }
  // Password correct. If this account has 2FA switched on, do NOT start a session yet: hand
  // back a short-lived challenge, and the session is only issued once the code is proven.
  const twoFactor = await TwoFactor.findOne({ user: user.id, enabledAt: { $ne: null } });
  if (twoFactor) {
    return {
      kind: 'two_factor_required',
      challengeToken: signChallengeToken({ userId: user.id, remember: input.remember }, config.jwtAccessSecret),
    };
  }
  // A new login starts a new family, so each device has its own session.
  const issued = await issueSession(user, randomUUID(), input.remember, meta, config, new Date());
  await recordActivity(user.id, 'login', meta);
  return { kind: 'session', issued };
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
      await recordActivity(String(known.user), 'token_reuse_detected', meta);
    }
    throw invalidRefresh();
  }

  const user = await User.findById(claimed.user);
  if (!user) {
    await Session.deleteMany({ familyId: claimed.familyId });
    throw invalidRefresh();
  }
  return issueSession(
    user,
    claimed.familyId,
    claimed.persistent,
    meta,
    config,
    claimed.familyStartedAt ?? claimed.createdAt,
  );
}

/** Ends the session this token belongs to. Safe to call with an unknown or missing token. */
export async function endSession(rawToken: string | undefined, meta: RequestMeta = NO_META): Promise<void> {
  if (!rawToken) return;
  const session = await Session.findOne({ tokenHash: hashToken(rawToken) });
  if (session) {
    await Session.deleteMany({ familyId: session.familyId });
    await recordActivity(String(session.user), 'logout', meta);
  }
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await User.findById(userId);
  if (!user) throw new HttpError(401, 'unauthorized', 'Please sign in.');
  return toPublicUser(user);
}
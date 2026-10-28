import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import { RecoveryCode } from '../models/recovery-code.model.js';
import { TwoFactor } from '../models/two-factor.model.js';
import { User } from '../models/user.model.js';
import { HttpError } from '../utils/http-error.js';
import { verifyPassword } from '../utils/password.js';
import { base32Encode } from '../utils/base32.js';
import { decryptSecret, encryptSecret } from '../utils/secret-box.js';
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from '../utils/recovery-codes.js';
import { verifyChallengeToken } from '../utils/tokens.js';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../utils/totp.js';
import { recordActivity } from './activity.service.js';
import {
  issueSession,
  type AuthConfig,
  type IssuedSession,
  type RequestMeta,
} from './auth.service.js';
import type { SecondFactorInput } from '../validation/two-factor.js';

/** Five wrong second-factor attempts in a row lock the account's 2FA for 15 minutes. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60 * 1000;

export interface TwoFactorStatus {
  enabled: boolean;
  /** A secret was generated but not yet confirmed. */
  pending: boolean;
  recoveryCodesRemaining: number;
}

export interface SetupResult {
  /** The secret as text, for typing into an app by hand when the camera cannot scan. */
  secret: string;
  otpauthUri: string;
  /** The QR code as a PNG data URL, drawn by the server so no QR code library ships to the browser. */
  qrDataUrl: string;
}

const wrongPassword = () =>
  new HttpError(403, 'incorrect_password', 'That password is not correct.');

/** `status` differs: 401 at sign-in (nobody is signed in yet), 400 inside settings. */
const wrongCode = (status: number) =>
  new HttpError(
    status,
    'invalid_two_factor_code',
    'That code is not correct, or it has already been used.',
  );

async function requirePassword(
  userId: string,
  password: string,
): Promise<{ email: string }> {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw new HttpError(401, 'unauthorized', 'Please sign in.');
  if (!(await verifyPassword(password, user.passwordHash)))
    throw wrongPassword();
  return { email: user.email };
}

export async function getStatus(userId: string): Promise<TwoFactorStatus> {
  const record = await TwoFactor.findOne({ user: userId });
  const remaining = record?.enabledAt
    ? await RecoveryCode.countDocuments({ user: userId, usedAt: null })
    : 0;
  return {
    enabled: Boolean(record?.enabledAt),
    pending: Boolean(record && !record.enabledAt),
    recoveryCodesRemaining: remaining,
  };
}

/** Step 1 of turning 2FA on: make a secret and show it. Nothing is enforced until it is confirmed. */
export async function startSetup(
  userId: string,
  password: string,
  config: AuthConfig,
): Promise<SetupResult> {
  const { email } = await requirePassword(userId, password);
  const existing = await TwoFactor.findOne({ user: userId });
  if (existing?.enabledAt) {
    throw new HttpError(
      409,
      'two_factor_already_enabled',
      'Two-factor authentication is already on.',
    );
  }
  const secret = generateTotpSecret();
  // Starting again replaces any earlier unconfirmed secret.
  await TwoFactor.updateOne(
    { user: userId },
    {
      $set: {
        secretEnc: encryptSecret(secret, config.twoFactorKey, userId),
        enabledAt: null,
        lastUsedStep: 0,
        failedCount: 0,
        lockedUntil: null,
      },
    },
    { upsert: true },
  );
  const uri = otpauthUri(secret, email);
  return {
    secret: base32Encode(secret),
    otpauthUri: uri,
    qrDataUrl: await QRCode.toDataURL(uri, {
      margin: 1,
      width: 224,
      errorCorrectionLevel: 'M',
    }),
  };
}

/** Replaces the user's recovery codes with a fresh set. Returns the plain codes: the only time they exist. */
async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await RecoveryCode.deleteMany({ user: userId });
  await RecoveryCode.insertMany(
    codes.map((code) => ({
      user: userId,
      hash: hashRecoveryCode(normalizeRecoveryCode(code)!),
    })),
  );
  return codes;
}

/** Step 2: the person types a code from the app, proving it works, and only then is 2FA switched on. */
export async function confirmSetup(
  userId: string,
  code: string,
  meta: RequestMeta,
  config: AuthConfig,
): Promise<{ recoveryCodes: string[] }> {
  const record = await TwoFactor.findOne({ user: userId }).select('+secretEnc');
  if (!record || record.enabledAt) {
    throw new HttpError(
      409,
      'two_factor_not_pending',
      'Start the setup first.',
    );
  }
  const check = verifyTotp(
    decryptSecret(record.secretEnc, config.twoFactorKey, userId),
    code,
  );
  if (!check.valid) throw wrongCode(400);
  // Atomic: if two confirmations race, only one flips the switch.
  const flipped = await TwoFactor.updateOne(
    { user: userId, enabledAt: null },
    {
      $set: { enabledAt: new Date(), lastUsedStep: check.step, failedCount: 0 },
    },
  );
  if (flipped.matchedCount !== 1)
    throw new HttpError(
      409,
      'two_factor_not_pending',
      'Start the setup first.',
    );
  const recoveryCodes = await replaceRecoveryCodes(userId);
  await recordActivity(userId, 'two_factor_enabled', meta);
  return { recoveryCodes };
}

/**
 * Proves the second factor: an app code or a recovery code. Used by sign-in, disable and
 * regenerate. Protections, in order:
 *  - locked accounts are refused before anything is checked;
 *  - an app code must be in the time window AND newer than the last one accepted (no replay);
 *  - a recovery code is claimed with one atomic update (works once);
 *  - every failure counts, and the fifth in a row locks 2FA for 15 minutes.
 */
async function proveSecondFactor(
  userId: string,
  input: SecondFactorInput,
  failStatus: number,
  meta: RequestMeta,
  config: AuthConfig,
): Promise<void> {
  const record = await TwoFactor.findOne({
    user: userId,
    enabledAt: { $ne: null },
  }).select('+secretEnc');
  if (!record)
    throw new HttpError(
      409,
      'two_factor_not_enabled',
      'Two-factor authentication is not on.',
    );

  if (record.lockedUntil && record.lockedUntil.getTime() > Date.now()) {
    throw new HttpError(
      429,
      'two_factor_locked',
      'Too many wrong codes. Try again in a few minutes.',
    );
  }

  if (input.code !== undefined) {
    const check = verifyTotp(
      decryptSecret(record.secretEnc, config.twoFactorKey, userId),
      input.code,
    );
    if (check.valid) {
      // One atomic step: only succeeds if no code from this step or a later one was used yet.
      const claimed = await TwoFactor.updateOne(
        { _id: record._id, lastUsedStep: { $lt: check.step } },
        {
          $set: { lastUsedStep: check.step, failedCount: 0, lockedUntil: null },
        },
      );
      if (claimed.matchedCount === 1) return;
    }
  } else if (input.recoveryCode !== undefined) {
    const normalized = normalizeRecoveryCode(input.recoveryCode);
    if (normalized) {
      const claimed = await RecoveryCode.updateOne(
        { user: userId, hash: hashRecoveryCode(normalized), usedAt: null },
        { $set: { usedAt: new Date() } },
      );
      if (claimed.matchedCount === 1) {
        await TwoFactor.updateOne(
          { _id: record._id },
          { $set: { failedCount: 0, lockedUntil: null } },
        );
        await recordActivity(userId, 'recovery_code_used', meta);
        return;
      }
    }
  }

  // Failure: count it atomically, and lock at the limit.
  await TwoFactor.updateOne({ _id: record._id }, { $inc: { failedCount: 1 } }); // atomic increment
  const updated = await TwoFactor.findById(record._id);
  if (updated && updated.failedCount >= MAX_FAILED_ATTEMPTS) {
    await TwoFactor.updateOne(
      { _id: record._id },
      { $set: { failedCount: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } },
    );
  }
  await recordActivity(userId, 'two_factor_failed', meta);
  throw wrongCode(failStatus);
}

/** Second step of sign-in: the challenge from the password step plus a code gives the session. */
export async function completeLogin(
  challengeToken: string,
  input: SecondFactorInput,
  meta: RequestMeta,
  config: AuthConfig,
): Promise<IssuedSession> {
  const challenge = verifyChallengeToken(
    challengeToken,
    config.jwtAccessSecret,
  );
  const expired = () =>
    new HttpError(
      401,
      'invalid_challenge',
      'Your sign-in expired. Please start again.',
    );
  if (!challenge) throw expired();
  const user = await User.findById(challenge.userId);
  if (!user) throw expired();
  await proveSecondFactor(user.id, input, 401, meta, config);
  const issued = await issueSession(
    user,
    randomUUID(),
    challenge.remember,
    meta,
    config,
    new Date(),
  );
  await recordActivity(user.id, 'login', meta);
  return issued;
}

/** Turning 2FA off needs the password AND a code, so a stolen access token alone cannot do it. */
export async function disable(
  userId: string,
  password: string,
  input: SecondFactorInput,
  meta: RequestMeta,
  config: AuthConfig,
): Promise<void> {
  await requirePassword(userId, password);
  await proveSecondFactor(userId, input, 400, meta, config);
  await TwoFactor.deleteOne({ user: userId });
  await RecoveryCode.deleteMany({ user: userId });
  await recordActivity(userId, 'two_factor_disabled', meta);
}

export async function regenerateRecoveryCodes(
  userId: string,
  password: string,
  input: SecondFactorInput,
  meta: RequestMeta,
  config: AuthConfig,
): Promise<string[]> {
  await requirePassword(userId, password);
  await proveSecondFactor(userId, input, 400, meta, config);
  const codes = await replaceRecoveryCodes(userId);
  await recordActivity(userId, 'recovery_codes_regenerated', meta);
  return codes;
}

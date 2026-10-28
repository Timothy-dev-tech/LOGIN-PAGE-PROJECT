import { Schema, model, type Types } from 'mongoose';

/**
 * One document per user who has started (or finished) setting up 2FA.
 * `enabledAt: null` means "secret generated, not yet confirmed with a code" (pending).
 */
const twoFactorSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  // The TOTP secret, encrypted (see utils/secret-box.ts). Never returned by the API after setup.
  secretEnc: { type: String, required: true, select: false },
  enabledAt: { type: Date, default: null },
  // The newest 30-second step already accepted. A code from the same or an older step is
  // refused, so a code that was shoulder-surfed or intercepted cannot be replayed.
  lastUsedStep: { type: Number, default: 0 },
  // Wrong guesses in a row. At the limit the account is locked for a while.
  failedCount: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

export interface TwoFactorDoc {
  user: Types.ObjectId;
  secretEnc: string;
  enabledAt: Date | null;
  lastUsedStep: number;
  failedCount: number;
  lockedUntil: Date | null;
  createdAt: Date;
}

export const TwoFactor = model<TwoFactorDoc>('TwoFactor', twoFactorSchema);
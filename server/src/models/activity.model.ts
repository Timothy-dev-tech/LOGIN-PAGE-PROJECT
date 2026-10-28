import { Schema, model, type Types } from 'mongoose';

/** Everything the account activity page can show. Adding a type = add it here and in the page. */
export const ACTIVITY_TYPES = [
  'register',
  'login',
  'login_failed',
  'logout',
  'token_reuse_detected',
  'session_revoked',
  'other_sessions_revoked',
  'two_factor_enabled',
  'two_factor_disabled',
  'two_factor_failed',
  'recovery_code_used',
  'recovery_codes_regenerated',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** How long an entry is kept. Old entries delete themselves (privacy: do not keep data forever). */
export const ACTIVITY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const activitySchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ACTIVITY_TYPES, required: true },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  // MongoDB deletes the document by itself once this time passes (same trick as Session).
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});
// "my activity, newest first" is the only question we ask.
activitySchema.index({ user: 1, createdAt: -1 });

export interface ActivityDoc {
  user: Types.ObjectId;
  type: ActivityType;
  ip: string;
  userAgent: string;
  createdAt: Date;
  expiresAt: Date;
}

export const Activity = model<ActivityDoc>('Activity', activitySchema);
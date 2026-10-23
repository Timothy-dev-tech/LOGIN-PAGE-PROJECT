import { Schema, model, type Types } from 'mongoose';

/**
 * One document per refresh token. All tokens that come from one login share a `familyId`,
 * so a "session" (one device signed in) is the set of documents with the same familyId.
 *
 * Only a hash of the token is stored. If the database leaked, the hashes could not be used
 * as cookies.
 */
const sessionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  familyId: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  // Set when this token has been swapped for a new one. Using a token that is already used
  // is the sign of theft (see auth.service.ts).
  usedAt: { type: Date, default: null },
  persistent: { type: Boolean, required: true },
  userAgent: { type: String, default: '' },
  ip: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  // MongoDB deletes the document by itself once this time passes.
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export interface SessionDoc {
  user: Types.ObjectId;
  familyId: string;
  tokenHash: string;
  usedAt: Date | null;
  persistent: boolean;
  userAgent: string;
  ip: string;
  createdAt: Date;
  expiresAt: Date;
}

export const Session = model<SessionDoc>('Session', sessionSchema);
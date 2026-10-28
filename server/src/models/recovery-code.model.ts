import { Schema, model, type Types } from 'mongoose';

/**
 * One document per recovery code, in its own collection so that "use this code once" is a single
 * atomic update: find the unused document with this hash and mark it used. Two requests with
 * the same code cannot both win. Only the SHA-256 hash is stored.
 */
const recoveryCodeSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  hash: { type: String, required: true },
  usedAt: { type: Date, default: null },
});
recoveryCodeSchema.index({ user: 1, hash: 1 });

export interface RecoveryCodeDoc {
  user: Types.ObjectId;
  hash: string;
  usedAt: Date | null;
}

export const RecoveryCode = model<RecoveryCodeDoc>('RecoveryCode', recoveryCodeSchema);
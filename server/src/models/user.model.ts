import { Schema, model, type InferSchemaType } from 'mongoose';

export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Stored lowercase; the unique index makes "Tim@x.com" and "tim@x.com" the same account.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Only the bcrypt hash is stored, never the password. `select: false` keeps it out of
    // query results unless a query asks for it with .select('+passwordHash').
    passwordHash: { type: String, required: true, select: false },
    // Everyone starts as 'user'. Nothing in the register request can change this; admins
    // are made with the seed script (a later step). That stops "mass assignment".
    role: { type: String, enum: ROLES, default: 'user', required: true },
    termsAcceptedAt: { type: Date, required: true },
    termsVersion: { type: String, required: true },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);

/** The shape we send to the browser: no hash, no internals. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
}

export function toPublicUser(user: {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}
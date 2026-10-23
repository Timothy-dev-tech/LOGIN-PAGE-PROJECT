import type { Role } from '../models/user.model.js';

// Teaches TypeScript about the `req.auth` field that the requireAuth middleware fills in.
declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; role: Role };
    }
  }
}

export {};
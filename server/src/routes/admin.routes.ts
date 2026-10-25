import { Router } from 'express';
import { requireAuth } from '../middleware/require-auth.js';
import { requireRole } from '../middleware/require-role.js';
import { listUsers } from '../services/admin.service.js';
import { parsePagination } from '../validation/pagination.js';

export function createAdminRouter(jwtAccessSecret: string): Router {
  const router = Router();

  // Order matters: first "who are you?" (401), then "are you allowed?" (403).
  router.use(requireAuth(jwtAccessSecret), requireRole('admin'));

  router.get('/users', async (req, res) => {
    res.json(await listUsers(parsePagination(req.query)));
  });

  return router;
}
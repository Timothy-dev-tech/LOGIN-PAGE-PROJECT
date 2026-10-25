import { Router } from 'express';
import { createStudyLogController } from '../controllers/study-log.controller.js';
import { requireAuth } from '../middleware/require-auth.js';

export function createStudyLogRouter(jwtAccessSecret: string): Router {
  const router = Router();
  const controller = createStudyLogController();

  // Everything here needs a signed-in user. These routes use the Bearer access token, not a
  // cookie, so a foreign website cannot trigger them (no CSRF), which is why they do not use
  // the same-origin check that /refresh and /logout need.
  router.use(requireAuth(jwtAccessSecret));

  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.read);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);

  return router;
}
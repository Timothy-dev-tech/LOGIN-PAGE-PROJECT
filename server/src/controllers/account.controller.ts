import type { Request, RequestHandler } from 'express';
import { REFRESH_COOKIE_NAME } from '../config/auth.js';
import { listActivity } from '../services/activity.service.js';
import { listSessions, revokeOtherSessions, revokeSession } from '../services/session.service.js';
import { parsePagination } from '../validation/pagination.js';
import type { RequestMeta } from '../services/auth.service.js';

const me = (req: Request): string => req.auth!.userId;
const cookieOf = (req: Request): string | undefined => {
  const value: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value !== '' ? value : undefined;
};
const metaFrom = (req: Request): RequestMeta => ({
  userAgent: (req.get('user-agent') ?? '').slice(0, 200),
  ip: req.ip ?? '',
});

/** The "your account" routes: signed-in devices and the activity log. All need a valid access token. */
export function createAccountController() {
  const sessions: RequestHandler = async (req, res) => {
    res.json({ sessions: await listSessions(me(req), cookieOf(req)) });
  };
  const revokeOne: RequestHandler = async (req, res) => {
    await revokeSession(me(req), String(req.params.familyId), metaFrom(req));
    res.status(204).end();
  };
  const revokeOthers: RequestHandler = async (req, res) => {
    const revoked = await revokeOtherSessions(me(req), cookieOf(req), metaFrom(req));
    res.json({ revoked });
  };
  const activity: RequestHandler = async (req, res) => {
    res.json(await listActivity(me(req), parsePagination(req.query)));
  };
  return { sessions, revokeOne, revokeOthers, activity };
}
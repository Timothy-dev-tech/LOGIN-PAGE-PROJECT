import { Session } from '../models/session.model.js';
import { HttpError } from '../utils/http-error.js';
import { describeDevice } from '../utils/device.js';
import { hashToken } from '../utils/tokens.js';
import { recordActivity } from './activity.service.js';
import type { RequestMeta } from './auth.service.js';

/** One signed-in device. The id is the session's familyId, so it never changes when the token rotates. */
export interface PublicSession {
  id: string;
  device: string;
  ip: string;
  startedAt: Date;
  lastActiveAt: Date;
  /** True when "remember me" was ticked (the session lasts up to 30 days). */
  persistent: boolean;
  expiresAt: Date;
  /** True for the device that is asking. */
  current: boolean;
}

const FAMILY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new HttpError(404, 'not_found', 'Session not found.');

/**
 * Which session is the caller's own? The browser sends its refresh cookie to every /api/auth
 * route, so we can look it up. Returns null if there is no cookie, or it belongs to someone else.
 */
async function currentFamilyOf(userId: string, rawToken: string | undefined): Promise<string | null> {
  if (!rawToken) return null;
  const session = await Session.findOne({ tokenHash: hashToken(rawToken) });
  return session && String(session.user) === userId ? session.familyId : null;
}

/**
 * One row per device. Every refresh replaces the token, so a device has many token records
 * but exactly one that is still unused. That unused one is the live session.
 */
export async function listSessions(userId: string, rawToken: string | undefined): Promise<PublicSession[]> {
  const [live, currentFamily] = await Promise.all([
    Session.find({ user: userId, usedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }),
    currentFamilyOf(userId, rawToken),
  ]);
  return live.map((s) => ({
    id: s.familyId,
    device: describeDevice(s.userAgent),
    ip: s.ip,
    startedAt: s.familyStartedAt ?? s.createdAt,
    lastActiveAt: s.createdAt,
    persistent: s.persistent,
    expiresAt: s.expiresAt,
    current: s.familyId === currentFamily,
  }));
}

/** Signs one device out. Filtering by the owner too means you cannot end someone else's session. */
export async function revokeSession(userId: string, familyId: string, meta: RequestMeta): Promise<void> {
  if (!FAMILY_ID.test(familyId)) throw notFound();
  const result = await Session.deleteMany({ user: userId, familyId });
  if (result.deletedCount === 0) throw notFound();
  await recordActivity(userId, 'session_revoked', meta);
}

/** "Sign out everywhere else". Needs the cookie so we know which device to keep. */
export async function revokeOtherSessions(
  userId: string,
  rawToken: string | undefined,
  meta: RequestMeta,
): Promise<number> {
  const keep = await currentFamilyOf(userId, rawToken);
  if (!keep) {
    throw new HttpError(400, 'no_current_session', 'We could not tell which device you are on. Sign in again.');
  }
  const result = await Session.deleteMany({ user: userId, familyId: { $ne: keep } });
  if (result.deletedCount > 0) await recordActivity(userId, 'other_sessions_revoked', meta);
  return result.deletedCount;
}
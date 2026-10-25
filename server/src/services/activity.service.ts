import { Activity, ACTIVITY_RETENTION_MS, type ActivityType } from '../models/activity.model.js';
import { describeDevice } from '../utils/device.js';
import type { Pagination } from '../validation/pagination.js';
import type { RequestMeta } from './auth.service.js';
import type { Page } from './study-log.service.js';

export interface PublicActivity {
  id: string;
  type: ActivityType;
  device: string;
  ip: string;
  at: Date;
}

/**
 * Writes one line to the user's activity log. It never throws: if the log cannot be written,
 * the thing the person actually asked for (signing in, signing out) must still work.
 */
export async function recordActivity(userId: string, type: ActivityType, meta: RequestMeta): Promise<void> {
  try {
    await Activity.create({
      user: userId,
      type,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt: new Date(Date.now() + ACTIVITY_RETENTION_MS),
    });
  } catch (err) {
    console.error('Could not write activity log:', err);
  }
}

export async function listActivity(userId: string, { page, limit }: Pagination): Promise<Page<PublicActivity>> {
  const [docs, total] = await Promise.all([
    Activity.find({ user: userId })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Activity.countDocuments({ user: userId }),
  ]);
  const items = docs.map((d) => ({
    id: d.id as string,
    type: d.type,
    device: describeDevice(d.userAgent),
    ip: d.ip,
    at: d.createdAt,
  }));
  return { items, total, page, limit };
}
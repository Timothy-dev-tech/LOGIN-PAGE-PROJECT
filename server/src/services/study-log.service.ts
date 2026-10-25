import { StudyLog, toPublicStudyLog, type PublicStudyLog } from '../models/study-log.model.js';
import { HttpError } from '../utils/http-error.js';
import type { Pagination } from '../validation/pagination.js';
import type { StudyLogInput, StudyLogPatch } from '../validation/study-log.js';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

const notFound = () => new HttpError(404, 'not_found', 'Study log entry not found.');

/**
 * A Mongo id is exactly 24 hex characters. Checking first means "/api/study-logs/abc" is a
 * clean 404 instead of a database cast error.
 */
function assertId(id: string): void {
  if (!/^[0-9a-f]{24}$/i.test(id)) throw notFound();
}

// Every query below filters by BOTH the entry id and the owner. Someone else's entry is
// therefore "not found" (404), not "forbidden" (403): a 403 would confirm the id exists.

export async function listStudyLogs(userId: string, { page, limit }: Pagination): Promise<Page<PublicStudyLog>> {
  const [docs, total] = await Promise.all([
    StudyLog.find({ user: userId })
      .sort({ studiedOn: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    StudyLog.countDocuments({ user: userId }),
  ]);
  return { items: docs.map(toPublicStudyLog), total, page, limit };
}

export async function createStudyLog(userId: string, input: StudyLogInput): Promise<PublicStudyLog> {
  const doc = await StudyLog.create({ ...input, user: userId });
  return toPublicStudyLog(doc);
}

export async function getStudyLog(userId: string, id: string): Promise<PublicStudyLog> {
  assertId(id);
  const doc = await StudyLog.findOne({ _id: id, user: userId });
  if (!doc) throw notFound();
  return toPublicStudyLog(doc);
}

export async function updateStudyLog(userId: string, id: string, patch: StudyLogPatch): Promise<PublicStudyLog> {
  assertId(id);
  const doc = await StudyLog.findOneAndUpdate(
    { _id: id, user: userId },
    { $set: patch },
    { returnDocument: 'after', runValidators: true },
  );
  if (!doc) throw notFound();
  return toPublicStudyLog(doc);
}

export async function deleteStudyLog(userId: string, id: string): Promise<void> {
  assertId(id);
  const result = await StudyLog.deleteOne({ _id: id, user: userId });
  if (result.deletedCount === 0) throw notFound();
}
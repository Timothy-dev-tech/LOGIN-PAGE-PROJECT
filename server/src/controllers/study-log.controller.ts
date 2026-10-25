import type { Request, RequestHandler } from 'express';
import {
  createStudyLog,
  deleteStudyLog,
  getStudyLog,
  listStudyLogs,
  updateStudyLog,
} from '../services/study-log.service.js';
import { parsePagination } from '../validation/pagination.js';
import { parseStudyLogInput, parseStudyLogPatch } from '../validation/study-log.js';

// requireAuth runs before every handler here, so req.auth is always set.
const me = (req: Request): string => req.auth!.userId;
// Express types route params as string | string[]; ours are always a single string.
const idOf = (req: Request): string => String(req.params.id);

export function createStudyLogController() {
  const list: RequestHandler = async (req, res) => {
    res.json(await listStudyLogs(me(req), parsePagination(req.query)));
  };
  const create: RequestHandler = async (req, res) => {
    const entry = await createStudyLog(me(req), parseStudyLogInput(req.body));
    res.status(201).json({ entry });
  };
  const read: RequestHandler = async (req, res) => {
    res.json({ entry: await getStudyLog(me(req), idOf(req)) });
  };
  const update: RequestHandler = async (req, res) => {
    res.json({ entry: await updateStudyLog(me(req), idOf(req), parseStudyLogPatch(req.body)) });
  };
  const remove: RequestHandler = async (req, res) => {
    await deleteStudyLog(me(req), idOf(req));
    res.status(204).end();
  };
  return { list, create, read, update, remove };
}
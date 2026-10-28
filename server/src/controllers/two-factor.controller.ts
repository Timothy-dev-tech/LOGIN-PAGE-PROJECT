import type { Request, RequestHandler } from 'express';
import type { RequestMeta, AuthConfig } from '../services/auth.service.js';
import {
  confirmSetup,
  disable,
  getStatus,
  regenerateRecoveryCodes,
  startSetup,
} from '../services/two-factor.service.js';
import { parseCodeOnly, parsePasswordAndFactor, parsePasswordOnly } from '../validation/two-factor.js';

const meta = (req: Request): RequestMeta => ({
  userAgent: (req.get('user-agent') ?? '').slice(0, 200),
  ip: req.ip ?? '',
});

/** The 2FA settings routes. All of them need a valid access token (requireAuth runs first). */
export function createTwoFactorController(config: AuthConfig) {
  const status: RequestHandler = async (req, res) => {
    res.json(await getStatus(req.auth!.userId));
  };

  const setup: RequestHandler = async (req, res) => {
    const { password } = parsePasswordOnly(req.body);
    // The secret is in this response, so it must never be cached by the browser or a proxy.
    res.set('Cache-Control', 'no-store');
    res.json(await startSetup(req.auth!.userId, password, config));
  };

  const enable: RequestHandler = async (req, res) => {
    const { code } = parseCodeOnly(req.body);
    res.set('Cache-Control', 'no-store');
    res.json(await confirmSetup(req.auth!.userId, code, meta(req), config));
  };

  const turnOff: RequestHandler = async (req, res) => {
    const { password, ...factor } = parsePasswordAndFactor(req.body);
    await disable(req.auth!.userId, password, factor, meta(req), config);
    res.status(204).end();
  };

  const newRecoveryCodes: RequestHandler = async (req, res) => {
    const { password, ...factor } = parsePasswordAndFactor(req.body);
    res.set('Cache-Control', 'no-store');
    res.json({ recoveryCodes: await regenerateRecoveryCodes(req.auth!.userId, password, factor, meta(req), config) });
  };

  return { status, setup, enable, turnOff, newRecoveryCodes };
}
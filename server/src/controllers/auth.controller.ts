import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import {
  PERSISTENT_SESSION_TTL_MS,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
} from '../config/auth.js';
import {
  endSession,
  getCurrentUser,
  loginUser,
  refreshSession,
  registerUser,
  type AuthConfig,
  type IssuedSession,
  type RequestMeta,
} from '../services/auth.service.js';
import { HttpError } from '../utils/http-error.js';
import { parseLoginInput, parseRegisterInput } from '../validation/auth.js';

export interface AuthControllerOptions extends AuthConfig {
  secureCookies: boolean;
}

function metaFrom(req: Request): RequestMeta {
  return {
    userAgent: (req.get('user-agent') ?? '').slice(0, 200),
    ip: req.ip ?? '',
  };
}

export function createAuthController(options: AuthControllerOptions) {
  // Where and how the browser may keep and send the refresh token:
  //  httpOnly  - JavaScript on the page cannot read it (stops XSS from stealing it)
  //  secure    - only over HTTPS (switched on in production)
  //  sameSite  - only sent when the request comes from our own site (stops CSRF)
  //  path      - only sent to /api/auth, not to every request
  const baseCookie: CookieOptions = {
    httpOnly: true,
    secure: options.secureCookies,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  };

  function sendSession(
    res: Response,
    issued: IssuedSession,
    status = 200,
  ): void {
    // No maxAge = a session cookie that disappears when the browser closes ("remember me" off).
    res.cookie(REFRESH_COOKIE_NAME, issued.refreshToken, {
      ...baseCookie,
      ...(issued.persistent ? { maxAge: PERSISTENT_SESSION_TTL_MS } : {}),
    });
    res
      .status(status)
      .json({ accessToken: issued.accessToken, user: issued.user });
  }

  const register: RequestHandler = async (req, res) => {
    const user = await registerUser(
      parseRegisterInput(req.body),
      options,
      metaFrom(req),
    );
    res.status(201).json({ user });
  };

  const login: RequestHandler = async (req, res) => {
    sendSession(
      res,
      await loginUser(parseLoginInput(req.body), metaFrom(req), options),
    );
  };

  const refresh: RequestHandler = async (req, res) => {
    const token: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
    if (typeof token !== 'string' || token === '') {
      throw new HttpError(
        401,
        'invalid_refresh_token',
        'Your session has ended. Please sign in again.',
      );
    }
    sendSession(res, await refreshSession(token, metaFrom(req), options));
  };

  const logout: RequestHandler = async (req, res) => {
    const token: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
    await endSession(
      typeof token === 'string' ? token : undefined,
      metaFrom(req),
    );
    res.clearCookie(REFRESH_COOKIE_NAME, baseCookie);
    res.status(204).end();
  };

  const me: RequestHandler = async (req, res) => {
    // requireAuth ran first, so req.auth is set.
    res.json({ user: await getCurrentUser(req.auth!.userId) });
  };

  return { register, login, refresh, logout, me };
}

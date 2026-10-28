import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createApp } from './app.js';
import { REFRESH_COOKIE_NAME } from './config/auth.js';
import { Activity } from './models/activity.model.js';
import { RecoveryCode } from './models/recovery-code.model.js';
import { TwoFactor } from './models/two-factor.model.js';
import { LOCK_MS, MAX_FAILED_ATTEMPTS } from './services/two-factor.service.js';
import { clearTestDb, disconnectTestDb } from './test/db.js';
import {
  bearer,
  makeApp,
  password,
  prepareDb,
  secret,
  signUp,
  twoFactorKey,
} from './test/api.js';
import { base32Decode } from './utils/base32.js';
import { decryptSecret } from './utils/secret-box.js';
import { stepAt, totpAt } from './utils/totp.js';

const app = makeApp();
const email = 'tim@example.com';

beforeAll(async () => {
  await prepareDb('login_page_two_factor');
  await TwoFactor.init();
});
beforeEach(clearTestDb);
afterEach(() => vi.useRealTimers());
afterAll(disconnectTestDb);

// Only Date is faked (not setTimeout), so supertest and the database driver keep working.
// Every 30 seconds of fake time is a new TOTP step, which lets the tests use many "fresh" codes
// without waiting, and lets them prove that the same code cannot be used twice.
const T0 = Date.UTC(2026, 9, 27, 12, 0, 0);
function clock(secondsAfterStart: number) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0 + secondsAfterStart * 1000);
}
const codeFor = (base32Secret: string, secondsAfterStart: number) =>
  totpAt(base32Decode(base32Secret), T0 + secondsAfterStart * 1000);

/** Registers, signs in, runs the whole setup and returns what a test needs. Ends at t = 0. */
async function enableTwoFactor() {
  clock(0);
  const { access, id } = await signUp(app, email);
  const setup = await request(app)
    .post('/api/auth/2fa/setup')
    .set(bearer(access))
    .send({ password });
  const enable = await request(app)
    .post('/api/auth/2fa/enable')
    .set(bearer(access))
    .send({ code: codeFor(setup.body.secret, 0) });
  return {
    access,
    id,
    secret: setup.body.secret as string,
    recoveryCodes: enable.body.recoveryCodes as string[],
    setup,
    enable,
  };
}

/** Password step of sign-in. */
const passwordStep = (remember = false) =>
  request(app).post('/api/auth/login').send({ email, password, remember });
/** Both steps; returns the second response. */
async function challenge(remember = false): Promise<string> {
  const res = await passwordStep(remember);
  return res.body.challengeToken as string;
}
const verify = (body: Record<string, unknown>) =>
  request(app).post('/api/auth/2fa/verify').send(body);
const activityTypes = async () =>
  (await Activity.find().sort({ createdAt: 1, _id: 1 })).map((a) => a.type);

describe('status', () => {
  it('needs a token and starts as off', async () => {
    expect((await request(app).get('/api/auth/2fa')).status).toBe(401);
    const { access } = await signUp(app, email);
    const res = await request(app).get('/api/auth/2fa').set(bearer(access));
    expect(res.body).toEqual({
      enabled: false,
      pending: false,
      recoveryCodesRemaining: 0,
    });
  });
});

describe('setup', () => {
  it('needs a token', async () => {
    expect(
      (await request(app).post('/api/auth/2fa/setup').send({ password }))
        .status,
    ).toBe(401);
  });

  it('asks for the password again, and says 403 (not 401) when it is wrong', async () => {
    const { access } = await signUp(app, email);
    const wrong = await request(app)
      .post('/api/auth/2fa/setup')
      .set(bearer(access))
      .send({ password: 'Nope12345' });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe('incorrect_password');
    const missing = await request(app)
      .post('/api/auth/2fa/setup')
      .set(bearer(access))
      .send({});
    expect(missing.status).toBe(400);
    expect(missing.body.error.details.fieldErrors.password).toBeTruthy();
  });

  it('returns the secret, the otpauth address and a QR image, and forbids caching', async () => {
    const { access } = await signUp(app, email);
    const res = await request(app)
      .post('/api/auth/2fa/setup')
      .set(bearer(access))
      .send({ password });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.secret).toMatch(/^[A-Z2-7]{32}$/); // 20 bytes = 32 base32 characters
    expect(res.body.otpauthUri).toContain('otpauth://totp/TimSol:');
    expect(res.body.otpauthUri).toContain(`secret=${res.body.secret}`);
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('stores the secret encrypted, bound to the user, and reports pending', async () => {
    const { access, id } = await signUp(app, email);
    const res = await request(app)
      .post('/api/auth/2fa/setup')
      .set(bearer(access))
      .send({ password });
    const record = await TwoFactor.findOne({ user: id }).select('+secretEnc');
    expect(record!.secretEnc).not.toContain(res.body.secret);
    expect(record!.secretEnc.startsWith('v1.')).toBe(true);
    const plain = decryptSecret(record!.secretEnc, twoFactorKey, id);
    expect(plain.equals(base32Decode(res.body.secret))).toBe(true);
    expect(() =>
      decryptSecret(record!.secretEnc, twoFactorKey, 'someone-else'),
    ).toThrow();
    const status = await request(app).get('/api/auth/2fa').set(bearer(access));
    expect(status.body).toEqual({
      enabled: false,
      pending: true,
      recoveryCodesRemaining: 0,
    });
  });

  it('pending 2FA does not change sign-in', async () => {
    const { access } = await signUp(app, email);
    await request(app)
      .post('/api/auth/2fa/setup')
      .set(bearer(access))
      .send({ password });
    const res = await passwordStep();
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.twoFactorRequired).toBeUndefined();
  });

  it('starting again replaces the unconfirmed secret', async () => {
    clock(0);
    const { access } = await signUp(app, email);
    const first = await request(app)
      .post('/api/auth/2fa/setup')
      .set(bearer(access))
      .send({ password });
    const second = await request(app)
      .post('/api/auth/2fa/setup')
      .set(bearer(access))
      .send({ password });
    expect(second.body.secret).not.toBe(first.body.secret);
    const old = await request(app)
      .post('/api/auth/2fa/enable')
      .set(bearer(access))
      .send({ code: codeFor(first.body.secret, 0) });
    expect(old.status).toBe(400);
    const fresh = await request(app)
      .post('/api/auth/2fa/enable')
      .set(bearer(access))
      .send({ code: codeFor(second.body.secret, 0) });
    expect(fresh.status).toBe(200);
  });
});

describe('enable', () => {
  it('refuses to enable without a setup first', async () => {
    const { access } = await signUp(app, email);
    const res = await request(app)
      .post('/api/auth/2fa/enable')
      .set(bearer(access))
      .send({ code: '123456' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('two_factor_not_pending');
  });

  it('refuses a wrong code and stays off', async () => {
    clock(0);
    const { access } = await signUp(app, email);
    const setup = await request(app)
      .post('/api/auth/2fa/setup')
      .set(bearer(access))
      .send({ password });
    const good = codeFor(setup.body.secret, 0);
    const wrong = String((Number(good) + 1) % 1_000_000).padStart(6, '0');
    const res = await request(app)
      .post('/api/auth/2fa/enable')
      .set(bearer(access))
      .send({ code: wrong });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_two_factor_code');
    expect(
      (await request(app).get('/api/auth/2fa').set(bearer(access))).body
        .enabled,
    ).toBe(false);
    expect(
      (
        await request(app)
          .post('/api/auth/2fa/enable')
          .set(bearer(access))
          .send({})
      ).status,
    ).toBe(400);
  });

  it('switches on, returns 10 recovery codes once, and stores only their hashes', async () => {
    const { access, id, recoveryCodes, enable } = await enableTwoFactor();
    expect(enable.status).toBe(200);
    expect(enable.headers['cache-control']).toBe('no-store');
    expect(recoveryCodes).toHaveLength(10);
    const stored = await RecoveryCode.find({ user: id });
    expect(stored).toHaveLength(10);
    for (const code of recoveryCodes) {
      expect(stored.some((s) => s.hash.includes(code.replace('-', '')))).toBe(
        false,
      );
    }
    const status = await request(app).get('/api/auth/2fa').set(bearer(access));
    expect(status.body).toEqual({
      enabled: true,
      pending: false,
      recoveryCodesRemaining: 10,
    });
    expect(await activityTypes()).toContain('two_factor_enabled');
  });

  it('cannot be set up or enabled a second time', async () => {
    const { access, secret: s } = await enableTwoFactor();
    const setup = await request(app)
      .post('/api/auth/2fa/setup')
      .set(bearer(access))
      .send({ password });
    expect(setup.status).toBe(409);
    expect(setup.body.error.code).toBe('two_factor_already_enabled');
    clock(30);
    const enable = await request(app)
      .post('/api/auth/2fa/enable')
      .set(bearer(access))
      .send({ code: codeFor(s, 30) });
    expect(enable.status).toBe(409);
  });
});

describe('signing in with 2FA on', () => {
  it('the password step gives a challenge and no session', async () => {
    await enableTwoFactor();
    const res = await passwordStep();
    expect(res.status).toBe(200);
    expect(res.body.twoFactorRequired).toBe(true);
    expect(typeof res.body.challengeToken).toBe('string');
    expect(res.body.accessToken).toBeUndefined();
    expect(res.body.user).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('a wrong password still looks exactly like before (no hint that 2FA exists)', async () => {
    await enableTwoFactor();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Wrong12345' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_credentials');
  });

  it('a challenge is not an access token', async () => {
    await enableTwoFactor();
    const token = await challenge();
    expect(
      (await request(app).get('/api/auth/me').set(bearer(token))).status,
    ).toBe(401);
    expect(
      (await request(app).get('/api/auth/2fa').set(bearer(token))).status,
    ).toBe(401);
  });

  it('an access token is not a challenge', async () => {
    const { access, secret: s } = await enableTwoFactor();
    clock(30);
    const res = await verify({ challengeToken: access, code: codeFor(s, 30) });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_challenge');
  });

  it('a challenge expires after 5 minutes', async () => {
    const { secret: s } = await enableTwoFactor();
    const token = await challenge();
    clock(5 * 60 + 5);
    const res = await verify({
      challengeToken: token,
      code: codeFor(s, 5 * 60 + 5),
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_challenge');
  });

  it('a made-up or missing challenge is refused', async () => {
    const { secret: s } = await enableTwoFactor();
    clock(30);
    expect(
      (await verify({ challengeToken: 'nonsense', code: codeFor(s, 30) }))
        .status,
    ).toBe(401);
    const missing = await verify({ code: codeFor(s, 30) });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details.fieldErrors.challengeToken).toBeTruthy();
  });

  it('a correct code starts the session: cookie, access token that works, login activity', async () => {
    const { secret: s, id } = await enableTwoFactor();
    const token = await challenge();
    clock(30);
    const res = await verify({ challengeToken: token, code: codeFor(s, 30) });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(id);
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find(
      (c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`),
    )!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain('Max-Age'); // remember me was off
    expect(
      (await request(app).get('/api/auth/me').set(bearer(res.body.accessToken)))
        .status,
    ).toBe(200);
    expect(await activityTypes()).toContain('login');
  });

  it('"remember me" chosen at the password step survives to the cookie', async () => {
    const { secret: s } = await enableTwoFactor();
    const token = await challenge(true);
    clock(30);
    const res = await verify({ challengeToken: token, code: codeFor(s, 30) });
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find(
      (c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`),
    )!;
    expect(cookie).toContain('Max-Age=2592000');
  });

  it('the same code cannot be used twice (replay protection), but the next one works', async () => {
    const { secret: s } = await enableTwoFactor(); // used step 0 to enable
    const token = await challenge();
    // Step 0's code is still inside the accepted window, but it was already used to enable.
    const replay = await verify({ challengeToken: token, code: codeFor(s, 0) });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('invalid_two_factor_code');
    clock(30);
    const ok = await verify({ challengeToken: token, code: codeFor(s, 30) });
    expect(ok.status).toBe(200);
    const again = await verify({ challengeToken: token, code: codeFor(s, 30) });
    expect(again.status).toBe(401);
  });

  it('a wrong code is 401 and is written to the activity log', async () => {
    const { secret: s } = await enableTwoFactor();
    const token = await challenge();
    clock(30);
    const good = codeFor(s, 30);
    const wrong = String((Number(good) + 7) % 1_000_000).padStart(6, '0');
    const res = await verify({ challengeToken: token, code: wrong });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_two_factor_code');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await activityTypes()).toContain('two_factor_failed');
  });

  it('asks for exactly one of code or recoveryCode', async () => {
    await enableTwoFactor();
    const token = await challenge();
    expect((await verify({ challengeToken: token })).status).toBe(400);
    expect(
      (
        await verify({
          challengeToken: token,
          code: '123456',
          recoveryCode: 'abcde-fghjk',
        })
      ).status,
    ).toBe(400);
    expect((await verify({ challengeToken: token, code: 123456 })).status).toBe(
      400,
    );
  });
});

describe('lockout', () => {
  it(`locks after ${MAX_FAILED_ATTEMPTS} wrong codes, even for the right one, then unlocks`, async () => {
    const { secret: s } = await enableTwoFactor();
    const token = await challenge();
    clock(30);
    const good = codeFor(s, 30);
    const wrong = String((Number(good) + 7) % 1_000_000).padStart(6, '0');
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      expect(
        (await verify({ challengeToken: token, code: wrong })).status,
      ).toBe(401);
    }
    const locked = await verify({ challengeToken: token, code: good });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('two_factor_locked');

    // 15 minutes later. The challenge has expired, so sign in again, then use a fresh code.
    const later = 30 + LOCK_MS / 1000 + 60;
    clock(later);
    const fresh = await challenge();
    const res = await verify({
      challengeToken: fresh,
      code: codeFor(s, later),
    });
    expect(res.status).toBe(200);
  });

  it('a success resets the failure count', async () => {
    const { secret: s, id } = await enableTwoFactor();
    const token = await challenge();
    clock(30);
    const wrong = String((Number(codeFor(s, 30)) + 7) % 1_000_000).padStart(
      6,
      '0',
    );
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++)
      await verify({ challengeToken: token, code: wrong });
    expect((await TwoFactor.findOne({ user: id }))!.failedCount).toBe(
      MAX_FAILED_ATTEMPTS - 1,
    );
    expect(
      (await verify({ challengeToken: token, code: codeFor(s, 30) })).status,
    ).toBe(200);
    expect((await TwoFactor.findOne({ user: id }))!.failedCount).toBe(0);
  });

  it('the per-IP limiter also stops a flood of wrong codes', async () => {
    const limited = createApp(
      {
        nodeEnv: 'test',
        clientOrigin: 'http://localhost:5173',
        jwtAccessSecret: secret,
        bcryptCost: 4,
        twoFactorKey,
      },
      {
        loginLimit: { windowMs: 60_000, max: 1000 },
        twoFactorLimit: { windowMs: 60_000, max: 2 },
      },
    );
    await enableTwoFactor();
    const token = (
      await request(limited).post('/api/auth/login').send({ email, password })
    ).body.challengeToken;
    const attempts = [];
    for (let i = 0; i < 4; i++)
      attempts.push(
        (
          await request(limited)
            .post('/api/auth/2fa/verify')
            .send({ challengeToken: token, code: '000000' })
        ).status,
      );
    expect(attempts).toEqual([401, 401, 429, 429]);
  });
});

describe('recovery codes', () => {
  it('sign you in once, forgive case and a missing dash, and are logged', async () => {
    const { recoveryCodes, access } = await enableTwoFactor();
    const token = await challenge();
    const first = await verify({
      challengeToken: token,
      recoveryCode: recoveryCodes[0]!.toUpperCase().replace('-', ' '),
    });
    expect(first.status).toBe(200);
    const reuse = await verify({
      challengeToken: token,
      recoveryCode: recoveryCodes[0],
    });
    expect(reuse.status).toBe(401);
    expect(await activityTypes()).toContain('recovery_code_used');
    const status = await request(app)
      .get('/api/auth/2fa')
      .set(bearer(first.body.accessToken ?? access));
    expect(status.body.recoveryCodesRemaining).toBe(9);
  });

  it('an unknown or malformed recovery code fails and counts as a wrong attempt', async () => {
    const { id } = await enableTwoFactor();
    const token = await challenge();
    expect(
      (await verify({ challengeToken: token, recoveryCode: 'aaaaa-bbbbb' }))
        .status,
    ).toBe(401);
    expect(
      (await verify({ challengeToken: token, recoveryCode: 'x' })).status,
    ).toBe(401);
    expect((await TwoFactor.findOne({ user: id }))!.failedCount).toBe(2);
  });

  it('two requests with the same recovery code cannot both win', async () => {
    const { recoveryCodes } = await enableTwoFactor();
    const token = await challenge();
    const results = await Promise.all([
      verify({ challengeToken: token, recoveryCode: recoveryCodes[1] }),
      verify({ challengeToken: token, recoveryCode: recoveryCodes[1] }),
    ]);
    // On a real MongoDB exactly one wins. (FerretDB in the sandbox is not atomic.)
    const wins = results.filter((r) => r.status === 200).length;
    if (process.env.SKIP_ATOMICITY_TESTS)
      expect(wins).toBeGreaterThanOrEqual(1);
    else expect(wins).toBe(1);
  });

  it('regenerating needs the password and a code, and kills the old set', async () => {
    const { access, secret: s, recoveryCodes } = await enableTwoFactor();
    clock(30);
    const wrongPw = await request(app)
      .post('/api/auth/2fa/recovery-codes')
      .set(bearer(access))
      .send({ password: 'Nope12345', code: codeFor(s, 30) });
    expect(wrongPw.status).toBe(403);
    const noCode = await request(app)
      .post('/api/auth/2fa/recovery-codes')
      .set(bearer(access))
      .send({ password });
    expect(noCode.status).toBe(400);
    const res = await request(app)
      .post('/api/auth/2fa/recovery-codes')
      .set(bearer(access))
      .send({ password, code: codeFor(s, 30) });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.recoveryCodes).toHaveLength(10);
    expect(res.body.recoveryCodes).not.toEqual(
      expect.arrayContaining(recoveryCodes.slice(0, 1)),
    );
    const token = await challenge();
    expect(
      (await verify({ challengeToken: token, recoveryCode: recoveryCodes[2] }))
        .status,
    ).toBe(401);
    expect(
      (
        await verify({
          challengeToken: token,
          recoveryCode: res.body.recoveryCodes[0],
        })
      ).status,
    ).toBe(200);
    expect(await activityTypes()).toContain('recovery_codes_regenerated');
  });
});

describe('disable', () => {
  it('needs the password and a code; then sign-in is back to one step and recovery codes are gone', async () => {
    const { access, secret: s, id } = await enableTwoFactor();
    clock(30);
    const code = codeFor(s, 30);
    expect(
      (
        await request(app)
          .post('/api/auth/2fa/disable')
          .set(bearer(access))
          .send({ code })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/auth/2fa/disable')
          .set(bearer(access))
          .send({ password: 'Nope12345', code })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/auth/2fa/disable')
          .set(bearer(access))
          .send({ password, code: '000000' })
      ).status,
    ).toBe(400);
    expect(
      (await request(app).get('/api/auth/2fa').set(bearer(access))).body
        .enabled,
    ).toBe(true);

    const res = await request(app)
      .post('/api/auth/2fa/disable')
      .set(bearer(access))
      .send({ password, code });
    expect(res.status).toBe(204);
    expect(await TwoFactor.countDocuments({ user: id })).toBe(0);
    expect(await RecoveryCode.countDocuments({ user: id })).toBe(0);
    expect((await passwordStep()).body.accessToken).toBeTruthy();
    expect(await activityTypes()).toContain('two_factor_disabled');
  });

  it('works with a recovery code when the phone is lost', async () => {
    const { access, recoveryCodes } = await enableTwoFactor();
    const res = await request(app)
      .post('/api/auth/2fa/disable')
      .set(bearer(access))
      .send({ password, recoveryCode: recoveryCodes[0] });
    expect(res.status).toBe(204);
  });

  it('says 409 when 2FA is not on', async () => {
    const { access } = await signUp(app, email);
    const res = await request(app)
      .post('/api/auth/2fa/disable')
      .set(bearer(access))
      .send({ password, code: '123456' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('two_factor_not_enabled');
  });

  it('2FA can be set up again afterwards with a new secret', async () => {
    const { access, secret: s } = await enableTwoFactor();
    clock(30);
    await request(app)
      .post('/api/auth/2fa/disable')
      .set(bearer(access))
      .send({ password, code: codeFor(s, 30) });
    const again = await request(app)
      .post('/api/auth/2fa/setup')
      .set(bearer(access))
      .send({ password });
    expect(again.status).toBe(200);
    expect(again.body.secret).not.toBe(s);
  });
});

describe('time helper sanity', () => {
  it('consecutive 30-second offsets are consecutive steps', () => {
    expect(stepAt(T0 + 30_000) - stepAt(T0)).toBe(1);
  });
});

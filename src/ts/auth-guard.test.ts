import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetSession, hasSessionHint, rememberSession, requireSession } from './auth-guard';

function fakeStorage(broken = false) {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => {
      if (broken) throw new Error('blocked');
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (broken) throw new Error('blocked');
      data.set(k, v);
    },
    removeItem: (k: string) => {
      if (broken) throw new Error('blocked');
      data.delete(k);
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('session hint', () => {
  it('remembers and forgets', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    expect(hasSessionHint()).toBe(false);
    rememberSession();
    expect(hasSessionHint()).toBe(true);
    forgetSession();
    expect(hasSessionHint()).toBe(false);
  });
  it('never throws when storage is blocked', () => {
    vi.stubGlobal('localStorage', fakeStorage(true));
    expect(() => rememberSession()).not.toThrow();
    expect(() => forgetSession()).not.toThrow();
    expect(hasSessionHint()).toBe(false);
  });
});

describe('requireSession', () => {
  const user = { id: '1', name: 'Tim', email: 'tim@x.com', role: 'user', createdAt: 'now' };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('returns the user and sets the hint when the refresh cookie works', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { accessToken: 't', user }));
    const redirect = vi.fn();
    await expect(requireSession(redirect)).resolves.toEqual(user);
    expect(redirect).not.toHaveBeenCalled();
    expect(hasSessionHint()).toBe(true);
  });

  it('sends a signed-out visitor to the login page and clears the hint', async () => {
    rememberSession();
    fetchMock.mockResolvedValueOnce(reply(401, { error: { code: 'invalid_refresh_token', message: 'No' } }));
    const redirect = vi.fn();
    const result = vi.fn();
    void requireSession(redirect).then(result);
    await vi.waitFor(() => expect(redirect).toHaveBeenCalledWith('/index.html?reason=expired'));
    expect(hasSessionHint()).toBe(false);
    expect(result).not.toHaveBeenCalled(); // it never resolves, so no dashboard code runs
  });

  it('lets other failures through so the page can offer a retry', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    const redirect = vi.fn();
    await expect(requireSession(redirect)).rejects.toMatchObject({ code: 'network' });
    expect(redirect).not.toHaveBeenCalled();
  });
});
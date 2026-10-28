import { describe, expect, it } from 'vitest';
import { describeActivity, formatDay, formatMinutes, timeAgo, todayLocal } from './format';

describe('formatDay', () => {
  it('writes a study day without touching timezones', () => {
    expect(formatDay('2026-10-20')).toBe('20 Oct 2026');
    expect(formatDay('2026-01-05')).toBe('5 Jan 2026');
  });
  it('returns unexpected text unchanged', () => {
    expect(formatDay('yesterday')).toBe('yesterday');
    expect(formatDay('2026-13-01')).toBe('2026-13-01');
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-10-25T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  it('says "just now" for the last moments', () => {
    expect(timeAgo(ago(10_000), now)).toBe('just now');
    expect(timeAgo(ago(-5_000), now)).toBe('just now'); // clock a little ahead of ours
  });
  it('counts minutes, hours and days', () => {
    expect(timeAgo(ago(5 * 60_000), now)).toBe('5 min ago');
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe('3 h ago');
    expect(timeAgo(ago(24 * 3_600_000), now)).toBe('1 day ago');
    expect(timeAgo(ago(3 * 86_400_000), now)).toBe('3 days ago');
  });
  it('switches to a date after a week', () => {
    expect(timeAgo('2026-10-01T12:00:00Z', now)).toMatch(/^\d{1,2} Oct 2026$/);
  });
  it('returns unparseable input unchanged', () => {
    expect(timeAgo('nope', now)).toBe('nope');
  });
});

describe('formatMinutes', () => {
  it('reads naturally', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(90)).toBe('1 h 30 min');
    expect(formatMinutes(1440)).toBe('24 h');
  });
});

describe('todayLocal', () => {
  it('uses the local calendar day', () => {
    expect(todayLocal(new Date(2026, 9, 5, 23, 30))).toBe('2026-10-05');
    expect(todayLocal(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
});

describe('describeActivity', () => {
  it('has a label and a tone for every known type', () => {
    expect(describeActivity('login')).toEqual({ label: 'Signed in', tone: 'normal' });
    expect(describeActivity('login_failed').tone).toBe('warn');
    expect(describeActivity('token_reuse_detected').tone).toBe('danger');
  });
  it('copes with a type it has never seen', () => {
    expect(describeActivity('password_changed' as never)).toEqual({ label: 'password changed', tone: 'normal' });
  });
});

describe('two-factor activity labels', () => {
  it('has a label for every new type, and flags the ones worth noticing', () => {
    expect(describeActivity('two_factor_enabled').label).toMatch(/turned on/);
    expect(describeActivity('two_factor_disabled').tone).toBe('warn');
    expect(describeActivity('two_factor_failed').tone).toBe('warn');
    expect(describeActivity('recovery_code_used').tone).toBe('warn');
    expect(describeActivity('recovery_codes_regenerated').label).toMatch(/recovery codes/);
  });
});
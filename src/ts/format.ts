// Small pure functions that turn API values into text people read. No DOM in here, so they can
// be tested on their own.
import type { ActivityType } from './api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A study day ("2026-10-20") as "20 Oct 2026". Read from the text, never through Date, so no timezone can shift it. */
export function formatDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : day;
}

/** A moment (ISO timestamp) as a calendar date in the viewer's own timezone: "20 Oct 2026". */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then a plain date after a week. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`;
  return formatDate(iso);
}

/** 45 -> "45 min", 90 -> "1 h 30 min", 120 -> "2 h". */
export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** Today's date where the person is, as "YYYY-MM-DD" (toISOString would give the UTC day). */
export function todayLocal(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export type Tone = 'normal' | 'warn' | 'danger';

const ACTIVITY: Record<ActivityType, { label: string; tone: Tone }> = {
  register: { label: 'Account created', tone: 'normal' },
  login: { label: 'Signed in', tone: 'normal' },
  login_failed: { label: 'Failed sign-in attempt', tone: 'warn' },
  logout: { label: 'Signed out', tone: 'normal' },
  token_reuse_detected: {
    label: 'Possible stolen sign-in blocked. Every device was signed out.',
    tone: 'danger',
  },
  session_revoked: { label: 'A device was signed out', tone: 'normal' },
  other_sessions_revoked: { label: 'All other devices were signed out', tone: 'normal' },
};

export function describeActivity(type: ActivityType): { label: string; tone: Tone } {
  // The server could add a type before this page learns about it; show something sensible.
  return ACTIVITY[type] ?? { label: type.replaceAll('_', ' '), tone: 'normal' };
}
/**
 * Turns a User-Agent header into something a person recognises, like "Chrome on Windows".
 * User-Agent strings are messy and easy to fake, so this is a label for the sessions page,
 * never something to base a security decision on.
 */
export function describeDevice(userAgent: string): string {
  const ua = userAgent.trim();
  if (ua === '') return 'Unknown device';

  // Order matters: Edge and Opera also say "Chrome", and Chrome also says "Safari".
  let browser: string | null = null;
  if (/PostmanRuntime/i.test(ua)) browser = 'Postman';
  else if (/^curl\//i.test(ua)) browser = 'curl';
  else if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  // iPhone user agents also say "Mac OS X", so check iOS before macOS.
  let os: string | null = null;
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Linux|X11/.test(ua)) os = 'Linux';

  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'Unknown device';
}
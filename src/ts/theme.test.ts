import { describe, expect, it } from 'vitest';
import { isTheme, nextTheme, resolveTheme } from './theme';

describe('isTheme', () => {
  it('accepts only the two theme names', () => {
    expect(isTheme('light')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('blue')).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});

describe('resolveTheme', () => {
  it('uses the saved choice over the system setting', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('falls back to the system setting when nothing is saved', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });

  it('ignores a saved value it does not recognise', () => {
    expect(resolveTheme('purple', true)).toBe('dark');
    expect(resolveTheme('', false)).toBe('light');
  });
});

describe('nextTheme', () => {
  it('flips between light and dark', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
  });
});
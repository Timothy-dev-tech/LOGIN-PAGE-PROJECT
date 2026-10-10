export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

// Pure: decide the theme from what we know. A saved choice beats the system setting.
export function resolveTheme(saved: string | null, systemPrefersDark: boolean): Theme {
  if (isTheme(saved)) return saved;
  return systemPrefersDark ? 'dark' : 'light';
}

export function nextTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark';
}

// localStorage can throw (private windows, blocked storage), so never trust it.
function readSavedTheme(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage is unavailable: the choice still applies to this visit, it just won't be remembered.
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function getCurrentTheme(): Theme {
  return resolveTheme(readSavedTheme(), systemPrefersDark());
}

// Wire the toggle button: it flips the theme, remembers the choice, and keeps
// aria-pressed in step so a screen reader hears "Dark theme, pressed / not pressed".
export function initThemeToggle(button: HTMLButtonElement): void {
  const sync = () => {
    button.setAttribute('aria-pressed', String(document.documentElement.dataset.theme === 'dark'));
  };

  applyTheme(getCurrentTheme());
  sync();

  button.addEventListener('click', () => {
    const next = nextTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    applyTheme(next);
    saveTheme(next);
    sync();
  });
}
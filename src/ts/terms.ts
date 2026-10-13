import { byId } from './dom';
import { initThemeToggle } from './theme';

// This page has no form, so the theme toggle is the only thing to set up.
initThemeToggle(byId('themeToggle', HTMLButtonElement));
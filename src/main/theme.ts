import * as fs from 'fs';
import {
  DEFAULT_THEME, defaultTokenColorsFor,
  type ThemeColors, type TokenColors, type FullTheme,
} from '../shared/theme';
import { loadConfig } from './config';

export function loadFullTheme(): FullTheme {
  const config = loadConfig();
  if (!config.pathToTheme) {
    return { colors: DEFAULT_THEME, tokenColors: defaultTokenColorsFor(DEFAULT_THEME.bg) };
  }

  try {
    const raw = fs.readFileSync(config.pathToTheme, 'utf-8');
    const parsed = JSON.parse(raw);
    const colors = { ...DEFAULT_THEME, ...(parsed.colors as Partial<ThemeColors>) };
    const baseTokenColors = defaultTokenColorsFor(colors.bg);
    return {
      colors,
      tokenColors: { ...baseTokenColors, ...(parsed.tokenColors as Partial<TokenColors>) },
    };
  } catch {
    return { colors: DEFAULT_THEME, tokenColors: defaultTokenColorsFor(DEFAULT_THEME.bg) };
  }
}

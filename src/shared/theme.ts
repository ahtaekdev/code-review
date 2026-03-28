export interface ThemeColors {
  bg: string;
  fg: string;
  border: string;
  mutedFg: string;

  accentBg: string;
  accentFg: string;

  successFg: string;
  warningFg: string;
  dangerFg: string;
}

export const DEFAULT_THEME: ThemeColors = {
  bg: '#ffffff',
  fg: '#1f2328',
  border: '#d0d7de',
  mutedFg: '#656d76',

  accentBg: '#ddf4ff',
  accentFg: '#0969da',

  successFg: '#1a7f37',
  warningFg: '#9a6700',
  dangerFg: '#cf222e',
};

export interface TokenColors {
  keyword: string;
  string: string;
  comment: string;
  number: string;
  function: string;
  type: string;
  operator: string;
  variable: string;
  punctuation: string;
}

export const DEFAULT_TOKEN_COLORS_LIGHT: TokenColors = {
  keyword: '#d73a49',
  string: '#032f62',
  comment: '#6a737d',
  number: '#005cc5',
  function: '#6f42c1',
  type: '#e36209',
  operator: '#d73a49',
  variable: '#24292e',
  punctuation: '#24292e',
};

export const DEFAULT_TOKEN_COLORS_DARK: TokenColors = {
  keyword: '#ff7b72',
  string: '#a5d6ff',
  comment: '#8b949e',
  number: '#79c0ff',
  function: '#d2a8ff',
  type: '#ffa657',
  operator: '#ff7b72',
  variable: '#c9d1d9',
  punctuation: '#c9d1d9',
};

export function isDarkBackground(hex: string): boolean {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 128;
}

export function defaultTokenColorsFor(bg: string): TokenColors {
  return isDarkBackground(bg)
    ? DEFAULT_TOKEN_COLORS_DARK
    : DEFAULT_TOKEN_COLORS_LIGHT;
}

export interface FullTheme {
  colors: ThemeColors;
  tokenColors: TokenColors;
}

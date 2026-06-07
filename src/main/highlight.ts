import * as path from 'path';
import type { HighlightToken } from '../shared/rpc';
import { isDarkBackground, type FullTheme } from '../shared/theme';

type Shiki = typeof import('shiki');
type Highlighter = Awaited<ReturnType<Shiki['createHighlighter']>>;

const THEME_NAME = 'code-review';

const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx',
  '.mjs': 'javascript', '.mts': 'typescript', '.cjs': 'javascript', '.cts': 'typescript',
  '.py': 'python', '.rs': 'rust', '.go': 'go',
  '.c': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.h': 'c', '.hpp': 'cpp',
  '.java': 'java', '.rb': 'ruby', '.php': 'php',
  '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.html': 'html', '.htm': 'html', '.vue': 'vue', '.svelte': 'svelte',
  '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.xml': 'xml',
  '.md': 'markdown', '.mdx': 'mdx',
  '.sh': 'bash', '.bash': 'bash', '.zsh': 'zsh', '.fish': 'fish',
  '.sql': 'sql', '.graphql': 'graphql', '.gql': 'graphql',
  '.swift': 'swift', '.kt': 'kotlin', '.kts': 'kotlin',
  '.lua': 'lua', '.r': 'r', '.R': 'r',
  '.cs': 'csharp', '.fs': 'fsharp',
  '.ex': 'elixir', '.exs': 'elixir', '.erl': 'erlang',
  '.hs': 'haskell', '.ml': 'ocaml',
  '.dart': 'dart', '.scala': 'scala',
  '.tf': 'hcl', '.dockerfile': 'dockerfile',
  '.zig': 'zig', '.nim': 'nim', '.v': 'v',
};

function buildShikiTheme(theme: FullTheme) {
  const { colors, tokenColors: tc } = theme;
  return {
    name: THEME_NAME,
    type: isDarkBackground(colors.bg) ? 'dark' as const : 'light' as const,
    colors: {
      'editor.background': colors.bg,
      'editor.foreground': colors.fg,
    },
    tokenColors: [
      {
        scope: ['keyword', 'storage', 'storage.type', 'storage.modifier',
                'keyword.control', 'keyword.function', 'keyword.import'],
        settings: { foreground: tc.keyword },
      },
      {
        scope: ['string', 'string.quoted', 'string.template',
                'string.regexp', 'string.special'],
        settings: { foreground: tc.string },
      },
      {
        scope: ['comment', 'comment.line', 'comment.block',
                'punctuation.definition.comment'],
        settings: { foreground: tc.comment },
      },
      {
        scope: ['constant.numeric', 'constant.language',
                'constant.character', 'constant.other'],
        settings: { foreground: tc.number },
      },
      {
        scope: ['entity.name.function', 'support.function',
                'meta.function-call entity.name.function'],
        settings: { foreground: tc.function },
      },
      {
        scope: ['entity.name.type', 'entity.name.class',
                'support.type', 'support.class',
                'entity.other.inherited-class'],
        settings: { foreground: tc.type },
      },
      {
        scope: ['keyword.operator', 'keyword.operator.assignment',
                'keyword.operator.comparison', 'keyword.operator.arithmetic',
                'keyword.operator.logical', 'keyword.operator.type.annotation',
                'punctuation.accessor', 'punctuation.separator.dot-access'],
        settings: { foreground: tc.operator },
      },
      {
        scope: ['variable', 'variable.other', 'variable.parameter',
                'variable.other.readwrite', 'variable.other.property'],
        settings: { foreground: tc.variable },
      },
      {
        scope: ['punctuation', 'meta.brace', 'meta.bracket',
                'punctuation.definition.block', 'punctuation.definition.parameters',
                'punctuation.separator', 'punctuation.terminator'],
        settings: { foreground: tc.punctuation },
      },
    ],
  };
}

let highlighter: Highlighter | null = null;

async function loadShiki(): Promise<Shiki> {
  return await (import(/* webpackIgnore: true */ 'shiki') as Promise<Shiki>);
}

export async function initHighlighter(theme: FullTheme): Promise<void> {
  if (highlighter) highlighter.dispose();

  const shiki = await loadShiki();
  highlighter = await shiki.createHighlighter({
    themes: [buildShikiTheme(theme)],
    langs: [],
  });
}

export async function updateHighlighterTheme(theme: FullTheme): Promise<void> {
  await initHighlighter(theme);
}

function detectLang(filePath: string): string | null {
  const basename = path.basename(filePath).toLowerCase();
  if (basename === 'dockerfile' || basename.startsWith('dockerfile.'))
    return 'dockerfile';
  if (basename === 'makefile' || basename === 'gnumakefile')
    return 'makefile';

  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_LANG[ext] ?? null;
}

export async function highlightCode(
  code: string,
  filePath: string,
): Promise<HighlightToken[][] | undefined> {
  if (!highlighter) return undefined;

  const lang = detectLang(filePath);
  if (!lang) return undefined;

  const loaded = highlighter.getLoadedLanguages();
  if (!loaded.includes(lang)) {
    try {
      const shiki = await loadShiki();
      const bundled = shiki.bundledLanguages as Record<string, unknown>;
      if (!(lang in bundled)) return undefined;
      await highlighter.loadLanguage(lang as any);
    } catch {
      return undefined;
    }
  }

  try {
    const lines = highlighter.codeToTokensBase(code, {
      lang: lang as any,
      theme: THEME_NAME as any,
    });
    return lines.map((line) =>
      line.map((t) => ({ content: t.content, color: t.color })),
    );
  } catch {
    return undefined;
  }
}

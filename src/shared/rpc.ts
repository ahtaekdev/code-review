import type { AppConfig } from './config';
import type { ThemeColors } from './theme';

export interface PlainFile {
  content: string;
  highlight?: HighlightToken[][];
  tooLarge?: boolean;
}

export type LlmCallResult =
  | { ok: true; response: string }
  | { ok: false; error_code: 'not_installed' | 'request_failed'; error?: string };

export interface RpcSchema {
  getGitStatus: {
    args: { compareMode?: CompareMode };
    response: GitStatus;
  };
  getFileTree: {
    args: { compareMode?: CompareMode };
    response: string[];
  };
  getFileDiff: {
    args: { path: string; untracked?: boolean; compareMode?: CompareMode };
    response: FileDiff;
  };
  getFilePlain: {
    args: { path: string };
    response: PlainFile;
  };
  readFile: {
    args: { path: string };
    response: string;
  };
  commitFiles: {
    args: { paths: string[]; message: string };
    response: void;
  };
  getConfig: {
    args: {};
    response: AppConfig;
  };
  getTheme: {
    args: {};
    response: ThemeColors;
  };
  getKnownFolders: {
    args: {};
    response: string[];
  };
  addKnownFolder: {
    args: { folder: string };
    response: string[];
  };
  removeKnownFolder: {
    args: { folder: string };
    response: string[];
  };
  changeFolder: {
    args: { folder: string };
    response: void;
  };
  pickFolder: {
    args: {};
    response: string | null;
  };
  getCurrentFolder: {
    args: {};
    response: string;
  };
  getActiveFolders: {
    args: {};
    response: string[];
  };
  addActiveFolder: {
    args: { folder: string };
    response: string[];
  };
  removeActiveFolder: {
    args: { folder: string };
    response: string[];
  };
  searchContent: {
    args: { query: string };
    response: ContentSearchFileResult[];
  };
  callLlm: {
    args: { prompt: string };
    response: LlmCallResult;
  };
}

export interface ContentSearchMatch {
  lineNumber: number;
  lineContent: string;
  contextBefore: string[];
  contextAfter: string[];
  contextStartLine: number;
}

export interface ContentSearchFileResult {
  filePath: string;
  matches: ContentSearchMatch[];
}

export type CompareMode = 'status' | 'primary';

export type ChangeKind = 'added' | 'modified' | 'deleted';

export interface ChangedFile {
  path: string;
  status: ChangeKind;
}

export interface GitStatus {
  branch: string;
  files: ChangedFile[];
  untracked: string[];
  compareMode: CompareMode;
  baseBranch?: string;
}

export type RpcName = keyof RpcSchema;

export interface RpcRequest {
  name: RpcName;
  args: unknown;
}

// --- Structured diff types ---

export interface DiffLine {
  type: 'context' | 'add' | 'remove';
  content: string;
  oldNo?: number;
  newNo?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  heading: string;
  lines: DiffLine[];
}

export interface HighlightToken {
  content: string;
  color?: string;
}

export interface FileDiff {
  hunks: DiffHunk[];
  oldFile: string | null;
  newFile: string | null;
  oldHighlight?: HighlightToken[][];
  newHighlight?: HighlightToken[][];
  tooLarge?: boolean;
}

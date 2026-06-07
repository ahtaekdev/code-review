import { execFile } from 'child_process';
import { promisify } from 'util';
import type { GitStatus, ChangedFile, ChangeKind, CompareMode, FileDiff, DiffHunk, DiffLine, ContentSearchFileResult, ContentSearchMatch } from '../shared/rpc';
import parseGitDiff from '../external-lib/parse-git-diff';
import type { Chunk, AnyLineChange } from '../external-lib/parse-git-diff';
import { readFile, fileSize } from './fs';

const exec = promisify(execFile);
const MAX_BUFFER = 10 * 1024 * 1024;

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await exec('git', ['rev-parse', '--git-dir'], { cwd: dir });
    return true;
  } catch {
    return false;
  }
}

async function getStatusRawDiff(dir: string, filePath: string): Promise<string> {
  try {
    const { stdout } = await exec('git', ['diff', 'HEAD', '--', filePath], {
      cwd: dir,
      maxBuffer: MAX_BUFFER,
    });
    return stdout;
  } catch {
    const { stdout } = await exec('git', ['diff', '--cached', '--', filePath], {
      cwd: dir,
      maxBuffer: MAX_BUFFER,
    });
    return stdout;
  }
}

async function getGitBlob(dir: string, ref: string, filePath: string): Promise<string | null> {
  try {
    const { stdout } = await exec('git', ['show', `${ref}:${filePath}`], {
      cwd: dir,
      maxBuffer: MAX_BUFFER,
    });
    return stdout;
  } catch {
    return null;
  }
}

async function getStatusOldFile(dir: string, filePath: string): Promise<string | null> {
  return getGitBlob(dir, 'HEAD', filePath);
}

async function getNewFile(dir: string, filePath: string): Promise<string | null> {
  try {
    return await readFile(dir, filePath);
  } catch {
    return null;
  }
}

async function getCurrentBranch(dir: string): Promise<string> {
  try {
    const { stdout } = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir });
    const branch = stdout.trim();
    return branch && branch !== 'HEAD' ? branch : '(detached)';
  } catch {
    return '(detached)';
  }
}

async function refExists(dir: string, ref: string): Promise<boolean> {
  try {
    await exec('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: dir });
    return true;
  } catch {
    return false;
  }
}

async function resolvePrimaryBranch(dir: string): Promise<string> {
  try {
    const { stdout } = await exec('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { cwd: dir });
    const originHead = stdout.trim();
    if (originHead && await refExists(dir, originHead)) return originHead;
  } catch {
    // origin/HEAD is optional
  }

  const candidates = ['origin/main', 'origin/master', 'main', 'master'];
  for (const candidate of candidates) {
    if (await refExists(dir, candidate)) return candidate;
  }

  throw new Error('Could not find a primary branch (tried origin/main, origin/master, main, master).');
}

async function getMergeBase(dir: string, baseBranch: string): Promise<string> {
  const { stdout } = await exec('git', ['merge-base', baseBranch, 'HEAD'], {
    cwd: dir,
    maxBuffer: MAX_BUFFER,
  });
  return stdout.trim();
}

async function getPrimaryRawDiff(dir: string, filePath: string, baseBranch: string): Promise<string> {
  const { stdout } = await exec('git', ['diff', '--no-renames', `${baseBranch}...HEAD`, '--', filePath], {
    cwd: dir,
    maxBuffer: MAX_BUFFER,
  });
  return stdout;
}

async function getGitBlobSize(dir: string, ref: string, filePath: string): Promise<number | null> {
  try {
    const { stdout } = await exec('git', ['cat-file', '-s', `${ref}:${filePath}`], {
      cwd: dir,
      maxBuffer: MAX_BUFFER,
    });
    const size = Number(stdout.trim());
    return Number.isFinite(size) ? size : null;
  } catch {
    return null;
  }
}

async function checkGitBlobTooLarge(dir: string, refs: string[], filePath: string): Promise<boolean> {
  const sizes = await Promise.all(refs.map((ref) => getGitBlobSize(dir, ref, filePath)));
  return sizes.some((size) => size != null && size > MAX_FILE_SIZE);
}

function convertChanges(changes: AnyLineChange[]): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const c of changes) {
    switch (c.type) {
      case 'AddedLine':
        lines.push({ type: 'add', content: c.content, newNo: c.lineAfter });
        break;
      case 'DeletedLine':
        lines.push({ type: 'remove', content: c.content, oldNo: c.lineBefore });
        break;
      case 'UnchangedLine':
        lines.push({ type: 'context', content: c.content, oldNo: c.lineBefore, newNo: c.lineAfter });
        break;
    }
  }
  return lines;
}

function parseDiffToHunks(rawDiff: string): DiffHunk[] {
  if (!rawDiff.trim()) return [];
  const parsed = parseGitDiff(rawDiff);
  if (parsed.files.length === 0) return [];

  const file = parsed.files[0];
  const hunks: DiffHunk[] = [];

  for (const chunk of file.chunks) {
    if (chunk.type !== 'Chunk') continue;
    const c = chunk as Chunk;
    hunks.push({
      oldStart: c.fromFileRange.start,
      oldCount: c.fromFileRange.lines,
      newStart: c.toFileRange.start,
      newCount: c.toFileRange.lines,
      heading: c.context || '',
      lines: convertChanges(c.changes),
    });
  }
  return hunks;
}

const MAX_FILE_SIZE = 100 * 1024;
const COMMIT_MESSAGE_FILE_LIMIT = 10;
const COMMIT_MESSAGE_LINES_PER_FILE = 100;

async function checkTooLarge(dir: string, filePath: string): Promise<boolean> {
  try {
    return (await fileSize(dir, filePath)) > MAX_FILE_SIZE;
  } catch {
    return false;
  }
}

async function getStatusFileDiff(dir: string, filePath: string): Promise<FileDiff> {
  if (await checkTooLarge(dir, filePath)) {
    return { hunks: [], oldFile: null, newFile: null, tooLarge: true };
  }

  const [rawDiff, oldFile, newFile] = await Promise.all([
    getStatusRawDiff(dir, filePath),
    getStatusOldFile(dir, filePath),
    getNewFile(dir, filePath),
  ]);

  return {
    hunks: parseDiffToHunks(rawDiff),
    oldFile,
    newFile,
  };
}

async function getPrimaryFileDiff(dir: string, filePath: string): Promise<FileDiff> {
  const baseBranch = await resolvePrimaryBranch(dir);
  const mergeBase = await getMergeBase(dir, baseBranch);

  if (await checkGitBlobTooLarge(dir, [mergeBase, 'HEAD'], filePath)) {
    return { hunks: [], oldFile: null, newFile: null, tooLarge: true };
  }

  const [rawDiff, oldFile, newFile] = await Promise.all([
    getPrimaryRawDiff(dir, filePath, baseBranch),
    getGitBlob(dir, mergeBase, filePath),
    getGitBlob(dir, 'HEAD', filePath),
  ]);

  return {
    hunks: parseDiffToHunks(rawDiff),
    oldFile,
    newFile,
  };
}

export async function getFileDiff(dir: string, filePath: string, compareMode: CompareMode = 'status'): Promise<FileDiff> {
  return compareMode === 'primary'
    ? getPrimaryFileDiff(dir, filePath)
    : getStatusFileDiff(dir, filePath);
}

export async function getUntrackedFileDiff(dir: string, filePath: string): Promise<FileDiff> {
  if (await checkTooLarge(dir, filePath)) {
    return { hunks: [], oldFile: null, newFile: null, tooLarge: true };
  }

  const newFile = await getNewFile(dir, filePath);
  if (!newFile) {
    return { hunks: [], oldFile: null, newFile: null };
  }

  const fileLines = newFile.split('\n');
  const lines: DiffLine[] = fileLines.map((content, i) => ({
    type: 'add' as const,
    content,
    newNo: i + 1,
  }));

  return {
    hunks: [{
      oldStart: 0,
      oldCount: 0,
      newStart: 1,
      newCount: fileLines.length,
      heading: '',
      lines,
    }],
    oldFile: null,
    newFile,
  };
}

async function getStatusFileTree(dir: string): Promise<string[]> {
  const { stdout: trackedOut } = await exec(
    'git', ['ls-files', '--full-name'],
    { cwd: dir, maxBuffer: MAX_BUFFER },
  );
  const { stdout: untrackedOut } = await exec(
    'git', ['ls-files', '--others', '--exclude-standard', '--full-name'],
    { cwd: dir, maxBuffer: MAX_BUFFER },
  );
  const all = new Set<string>();
  for (const line of trackedOut.split('\n')) {
    if (line) all.add(line);
  }
  for (const line of untrackedOut.split('\n')) {
    if (line) all.add(line);
  }
  return [...all].sort((a, b) => a.localeCompare(b));
}

async function getPrimaryChangedFiles(dir: string, baseBranch: string): Promise<ChangedFile[]> {
  const { stdout } = await exec(
    'git',
    ['diff', '--name-status', '--no-renames', `${baseBranch}...HEAD`],
    { cwd: dir, maxBuffer: MAX_BUFFER },
  );

  const files: ChangedFile[] = [];
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const [code, path] = line.split('\t');
    const status = STATUS_CHAR[code?.[0] ?? ''] ?? null;
    if (path && status) files.push({ path, status });
  }
  return files;
}

async function getPrimaryFileTree(dir: string): Promise<string[]> {
  const baseBranch = await resolvePrimaryBranch(dir);
  const { stdout } = await exec(
    'git', ['ls-tree', '-r', '--name-only', 'HEAD'],
    { cwd: dir, maxBuffer: MAX_BUFFER },
  );

  const all = new Set<string>();
  for (const line of stdout.split('\n')) {
    if (line) all.add(line);
  }

  for (const file of await getPrimaryChangedFiles(dir, baseBranch)) {
    all.add(file.path);
  }

  return [...all].sort((a, b) => a.localeCompare(b));
}

export async function getFileTree(dir: string, compareMode: CompareMode = 'status'): Promise<string[]> {
  return compareMode === 'primary'
    ? getPrimaryFileTree(dir)
    : getStatusFileTree(dir);
}

const STATUS_CHAR: Record<string, ChangeKind | null> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  T: 'modified',
};

function statusFromPorcelainXY(xy: string): ChangeKind | null {
  const indexChar = xy[0] === '.' ? ' ' : xy[0];
  const worktreeChar = xy[1] === '.' ? ' ' : xy[1];

  // A file staged as added is still an addition vs HEAD even if it has
  // additional unstaged edits (AM).
  if (indexChar === 'A') return 'added';

  const statusChar = worktreeChar !== ' ' ? worktreeChar : indexChar;
  return STATUS_CHAR[statusChar] ?? null;
}

async function getStatusGitStatus(dir: string): Promise<GitStatus> {
  const { stdout } = await exec(
    'git',
    ['status', '--porcelain=v2', '--branch', '--no-renames', '--untracked-files=all'],
    { cwd: dir, maxBuffer: MAX_BUFFER },
  );

  let branch = '(detached)';
  const files: ChangedFile[] = [];
  const untracked: string[] = [];

  for (const line of stdout.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      branch = line.slice('# branch.head '.length);
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const xy = line.slice(2, 4);
      const status = statusFromPorcelainXY(xy);
      if (status) {
        const path = line.slice(line.lastIndexOf(' ') + 1);
        files.push({ path, status });
      }
    } else if (line.startsWith('? ')) {
      untracked.push(line.slice(2));
    }
  }

  return { branch, files, untracked, compareMode: 'status' };
}

async function getPrimaryGitStatus(dir: string): Promise<GitStatus> {
  const [branch, baseBranch] = await Promise.all([
    getCurrentBranch(dir),
    resolvePrimaryBranch(dir),
  ]);
  const files = await getPrimaryChangedFiles(dir, baseBranch);
  return { branch, files, untracked: [], compareMode: 'primary', baseBranch };
}

export async function getGitStatus(dir: string, compareMode: CompareMode = 'status'): Promise<GitStatus> {
  return compareMode === 'primary'
    ? getPrimaryGitStatus(dir)
    : getStatusGitStatus(dir);
}

function limitDiffLines(diff: string): string {
  const lines = diff.split(/\r?\n/);
  if (lines.length <= COMMIT_MESSAGE_LINES_PER_FILE) return diff;
  const limited = lines.slice(0, COMMIT_MESSAGE_LINES_PER_FILE);
  limited[COMMIT_MESSAGE_LINES_PER_FILE - 1] = '...diff truncated after 100 lines';
  return limited.join('\n');
}

function formatUntrackedRawDiff(filePath: string, content: string): string {
  const lines = content.split(/\r?\n/);
  const out = [
    `diff --git a/${filePath} b/${filePath}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
  ];
  out.push(...lines.map((line) => `+${line}`));
  return out.join('\n');
}

async function getCommitMessageDiffForFile(dir: string, filePath: string, isUntracked: boolean): Promise<string> {
  if (await checkTooLarge(dir, filePath)) {
    return `diff --git a/${filePath} b/${filePath}\n[diff omitted: file too large]`;
  }

  if (isUntracked) {
    const content = await getNewFile(dir, filePath);
    return content == null
      ? `diff --git a/${filePath} b/${filePath}\n[diff omitted: file could not be read]`
      : formatUntrackedRawDiff(filePath, content);
  }

  const rawDiff = await getStatusRawDiff(dir, filePath);
  return rawDiff.trim()
    ? rawDiff
    : `diff --git a/${filePath} b/${filePath}\n[no diff available]`;
}

export async function getCommitMessageDiffContext(dir: string, paths: string[]): Promise<string> {
  const status = await getGitStatus(dir, 'status');
  const untracked = new Set(status.untracked);
  const includedPaths = paths.slice(0, COMMIT_MESSAGE_FILE_LIMIT);
  const sections: string[] = [];

  for (const filePath of includedPaths) {
    const diff = await getCommitMessageDiffForFile(dir, filePath, untracked.has(filePath));
    sections.push(limitDiffLines(diff));
  }

  const omittedCount = paths.length - includedPaths.length;
  if (omittedCount > 0) {
    sections.push(`...and ${omittedCount} more files omitted.`);
  }

  return sections.join('\n\n');
}

export async function commitFiles(
  dir: string,
  paths: string[],
  message: string,
): Promise<void> {
  await exec('git', ['add', '--', ...paths], { cwd: dir });
  await exec('git', ['commit', '-m', message], { cwd: dir });
}

// --- Content search via git grep ---

export async function searchContent(
  dir: string,
  query: string,
): Promise<ContentSearchFileResult[]> {
  if (!query || query.length < 2) return [];

  let stdout: string;
  try {
    const result = await exec(
      'git',
      ['grep', '-n', '-I', '-C', '3', '--max-count', '10', '--fixed-strings', '-e', query],
      { cwd: dir, maxBuffer: MAX_BUFFER },
    );
    stdout = result.stdout;
  } catch (e: any) {
    // git grep exits with code 1 when no matches found
    if (e.code === 1 || e.status === 1) return [];
    throw e;
  }

  if (!stdout.trim()) return [];

  // Split output into segments separated by '--' lines
  const segments = stdout.split(/\n--\n/);
  const fileMap = new Map<string, ContentSearchMatch[]>();

  for (const segment of segments) {
    const lines = segment.split('\n').filter((l) => l.length > 0);
    if (lines.length === 0) continue;

    // Parse each line: match lines have "file:lineNo:content", context lines have "file-lineNo-content"
    const parsed: { filePath: string; lineNo: number; content: string; isMatch: boolean }[] = [];

    for (const line of lines) {
      // Try match line first: file:lineNo:content
      const matchRe = /^(.+?):(\d+):(.*)$/;
      const contextRe = /^(.+?)-(\d+)-(.*)$/;

      let m = matchRe.exec(line);
      if (m) {
        parsed.push({ filePath: m[1], lineNo: parseInt(m[2], 10), content: m[3], isMatch: true });
        continue;
      }
      m = contextRe.exec(line);
      if (m) {
        parsed.push({ filePath: m[1], lineNo: parseInt(m[2], 10), content: m[3], isMatch: false });
      }
    }

    if (parsed.length === 0) continue;

    // Group consecutive parsed lines into individual matches (one per match line)
    for (let i = 0; i < parsed.length; i++) {
      if (!parsed[i].isMatch) continue;

      const matchLine = parsed[i];
      const contextBefore: string[] = [];
      const contextAfter: string[] = [];

      // Collect context before
      for (let j = i - 1; j >= 0 && !parsed[j].isMatch; j--) {
        contextBefore.unshift(parsed[j].content);
      }

      // Collect context after
      for (let j = i + 1; j < parsed.length && !parsed[j].isMatch; j++) {
        contextAfter.push(parsed[j].content);
      }

      const contextStartLine = matchLine.lineNo - contextBefore.length;

      const entry: ContentSearchMatch = {
        lineNumber: matchLine.lineNo,
        lineContent: matchLine.content,
        contextBefore,
        contextAfter,
        contextStartLine,
      };

      const arr = fileMap.get(matchLine.filePath);
      if (arr) arr.push(entry);
      else fileMap.set(matchLine.filePath, [entry]);
    }
  }

  const results: ContentSearchFileResult[] = [];
  for (const [filePath, matches] of fileMap) {
    results.push({ filePath, matches });
  }
  return results;
}

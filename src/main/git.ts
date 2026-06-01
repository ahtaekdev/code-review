import { execFile } from 'child_process';
import { promisify } from 'util';
import type { GitStatus, ChangedFile, ChangeKind, FileDiff, DiffHunk, DiffLine, ContentSearchFileResult, ContentSearchMatch } from '../shared/rpc';
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

async function getRawDiff(dir: string, filePath: string): Promise<string> {
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

async function getOldFile(dir: string, filePath: string): Promise<string | null> {
  try {
    const { stdout } = await exec('git', ['show', `HEAD:${filePath}`], {
      cwd: dir,
      maxBuffer: MAX_BUFFER,
    });
    return stdout;
  } catch {
    return null;
  }
}

async function getNewFile(dir: string, filePath: string): Promise<string | null> {
  try {
    return await readFile(dir, filePath);
  } catch {
    return null;
  }
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

async function checkTooLarge(dir: string, filePath: string): Promise<boolean> {
  try {
    return (await fileSize(dir, filePath)) > MAX_FILE_SIZE;
  } catch {
    return false;
  }
}

export async function getFileDiff(dir: string, filePath: string): Promise<FileDiff> {
  if (await checkTooLarge(dir, filePath)) {
    return { hunks: [], oldFile: null, newFile: null, tooLarge: true };
  }

  const [rawDiff, oldFile, newFile] = await Promise.all([
    getRawDiff(dir, filePath),
    getOldFile(dir, filePath),
    getNewFile(dir, filePath),
  ]);

  return {
    hunks: parseDiffToHunks(rawDiff),
    oldFile,
    newFile,
  };
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

export async function getFileTree(dir: string): Promise<string[]> {
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

const WORKTREE_STATUS: Record<string, ChangeKind | null> = {
  M: 'modified',
  D: 'deleted',
  T: 'modified',
};

export async function getGitStatus(dir: string): Promise<GitStatus> {
  const { stdout } = await exec(
    'git',
    ['status', '--porcelain=v2', '--branch'],
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
      const worktreeChar = xy[1];
      const status = WORKTREE_STATUS[worktreeChar] ?? null;
      if (status) {
        const path = line.slice(line.lastIndexOf(' ') + 1);
        files.push({ path, status });
      }
    } else if (line.startsWith('? ')) {
      untracked.push(line.slice(2));
    }
  }

  return { branch, files, untracked };
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

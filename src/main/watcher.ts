import * as fs from 'fs';
import * as path from 'path';
import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

async function getIgnoredDirs(dir: string): Promise<Set<string>> {
  const { stdout } = await exec(
    'git',
    ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory'],
    { cwd: dir },
  );

  const ignored = new Set<string>();
  ignored.add('.git');
  for (const line of stdout.split('\n')) {
    if (line.endsWith('/')) {
      ignored.add(line.slice(0, -1));
    }
  }
  return ignored;
}

/**
 * Check whether a relative file path falls under any ignored directory.
 * Used by the macOS recursive watcher to filter FSEvents callbacks cheaply.
 */
function isIgnored(relPath: string, ignored: Set<string>): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  for (const dir of ignored) {
    if (normalized === dir || normalized.startsWith(dir + '/')) {
      return true;
    }
  }
  return false;
}

function isIgnoredByGit(baseDir: string, relPath: string): boolean {
  if (!relPath) return false;
  try {
    execFileSync('git', ['check-ignore', '-q', '--', relPath], {
      cwd: baseDir,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk a directory tree synchronously, skipping ignored directories.
 * Used on Linux where per-directory inotify watches are cheap and we want
 * to avoid watching node_modules / .git / build artifacts.
 */
function walkDirs(
  baseDir: string,
  ignored: Set<string>,
  relative = '',
): string[] {
  const abs = relative ? path.join(baseDir, relative) : baseDir;
  const dirs = [abs];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return dirs;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (ignored.has(rel)) continue;
    dirs.push(...walkDirs(baseDir, ignored, rel));
  }

  return dirs;
}

export interface Watcher {
  close(): void;
}

/**
 * macOS: Uses a single fs.watch with { recursive: true } backed by FSEvents.
 * FSEvents watches the entire subtree with ONE OS-level stream (one FD),
 * so even huge node_modules trees cost nothing in terms of resources.
 * We filter events in the callback via cheap string prefix matching.
 *
 * Linux: Uses per-directory inotify watches, pre-filtered by git-ignored dirs.
 * inotify is cheap per-watch but each subdirectory needs its own descriptor,
 * so we must avoid watching node_modules (could be 50k+ subdirectories).
 */
export async function createWatcher(
  dir: string,
  onChange: () => void,
  debounceMs = 300,
): Promise<Watcher> {
  const ignored = await getIgnoredDirs(dir);

  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  };

  // macOS: single recursive FSEvents watcher — one stream, filter in callback
  if (process.platform === 'darwin') {
    const w = fs.watch(dir, { recursive: true }, (_event, filename) => {
      if (filename && isIgnored(filename, ignored)) return;
      debounced();
    });

    return {
      close() {
        closed = true;
        if (timer) clearTimeout(timer);
        w.close();
      },
    };
  }

  // Linux / other: per-directory inotify watches, pre-filtered by git ignores.
  // When a new directory appears, add watches for it (and any subdirectories)
  // immediately; otherwise later writes inside that directory are invisible.
  const watchers = new Map<string, fs.FSWatcher>();

  const relativeFromBase = (absPath: string): string | null => {
    const rel = path.relative(dir, absPath);
    if (!rel) return '';
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return null;
    return rel.replace(/\\/g, '/');
  };

  const shouldIgnore = (rel: string): boolean => {
    if (!rel) return false;
    if (isIgnored(rel, ignored)) return true;
    if (isIgnoredByGit(dir, rel)) {
      ignored.add(rel);
      return true;
    }
    return false;
  };

  const removeWatchTree = (absDir: string) => {
    const resolved = path.resolve(absDir);
    const prefix = resolved + path.sep;
    for (const [watchedDir, watcher] of Array.from(watchers.entries())) {
      if (watchedDir === resolved || watchedDir.startsWith(prefix)) {
        watchers.delete(watchedDir);
        watcher.close();
      }
    }
  };

  const watchDir = (absDir: string) => {
    if (closed) return;

    const resolved = path.resolve(absDir);
    if (watchers.has(resolved)) return;

    const rel = relativeFromBase(resolved);
    if (rel == null || (rel && isIgnored(rel, ignored))) return;

    try {
      const w = fs.watch(resolved, (event, filename) => {
        debounced();

        if (closed) return;
        if (!filename) {
          // Some platforms can omit the filename. Fall back to a full scan so
          // newly-created directories still get watchers.
          watchTree(dir);
          return;
        }

        const changedPath = path.resolve(resolved, filename.toString());
        watchTree(changedPath, event === 'rename');
      });

      watchers.set(resolved, w);
      const remove = () => watchers.delete(resolved);
      w.on('close', remove);
      w.on('error', remove);
    } catch {
      // directory may have vanished between scan and watch
    }
  };

  function watchTree(absPath: string, replaceRoot = false) {
    if (closed) return;

    const resolved = path.resolve(absPath);
    const rel = relativeFromBase(resolved);
    if (rel == null || (rel && isIgnored(rel, ignored))) return;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolved);
    } catch {
      removeWatchTree(resolved);
      return;
    }
    if (!stat.isDirectory()) return;
    if (rel && shouldIgnore(rel)) return;

    if (replaceRoot) removeWatchTree(resolved);

    for (const d of walkDirs(dir, ignored, rel)) {
      watchDir(d);
    }
  }

  watchTree(dir);

  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      for (const w of Array.from(watchers.values())) w.close();
      watchers.clear();
    },
  };
}

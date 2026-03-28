import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
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

  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = () => {
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
        if (timer) clearTimeout(timer);
        w.close();
      },
    };
  }

  // Linux / other: per-directory inotify watches, pre-filtered by git ignores
  const dirs = walkDirs(dir, ignored);
  const watchers: fs.FSWatcher[] = [];
  for (const d of dirs) {
    try {
      const w = fs.watch(d, debounced);
      watchers.push(w);
    } catch {
      // directory may have vanished between scan and watch
    }
  }

  return {
    close() {
      if (timer) clearTimeout(timer);
      for (const w of watchers) w.close();
    },
  };
}

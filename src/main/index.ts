import { app, BrowserWindow, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { initRpc, registerRpc } from './rpc';
import { isGitRepo, getGitStatus, getFileTree, getFileDiff, getUntrackedFileDiff, commitFiles, searchContent } from './git';
import { readFile, fileSize } from './fs';
import { loadConfig, getKnownFolders, addKnownFolder, removeKnownFolder, getActiveFolders, addActiveFolder, removeActiveFolder } from './config';
import { loadFullTheme } from './theme';
import { initHighlighter, updateHighlighterTheme, highlightCode } from './highlight';
import { createWatcher, type Watcher } from './watcher';
import { callLlmNoTools, generateCommitMessage } from './llm';

const argv = process.argv.slice(app.isPackaged ? 1 : 2);
const devMode = argv.includes('--dev');
let targetDir = path.resolve(argv.find((a) => !a.startsWith('--')) || '.');

let cachedIsGitRepo: boolean | null = null;

async function ensureGitRepo(): Promise<void> {
  if (cachedIsGitRepo === null) {
    cachedIsGitRepo = await isGitRepo(targetDir);
  }
  if (!cachedIsGitRepo) throw new Error('Not a git repository');
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: `Code Review — ${targetDir}`,
    titleBarStyle: devMode ? 'default' : 'hidden',
    ...(process.platform === 'linux' && !devMode ? { frame: false } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (devMode) win.webContents.openDevTools();
  return win;
}

initRpc();

registerRpc('getGitStatus', async () => {
  await ensureGitRepo();
  return getGitStatus(targetDir);
});

registerRpc('getFileDiff', async ({ path: filePath, untracked }) => {
  await ensureGitRepo();
  const diff = untracked
    ? await getUntrackedFileDiff(targetDir, filePath)
    : await getFileDiff(targetDir, filePath);

  if (!diff.tooLarge) {
    const [oldHL, newHL] = await Promise.all([
      diff.oldFile != null ? highlightCode(diff.oldFile, filePath) : undefined,
      diff.newFile != null ? highlightCode(diff.newFile, filePath) : undefined,
    ]);
    if (oldHL) diff.oldHighlight = oldHL;
    if (newHL) diff.newHighlight = newHL;
  }

  return diff;
});

registerRpc('getFileTree', async () => {
  await ensureGitRepo();
  return getFileTree(targetDir);
});

registerRpc('getFilePlain', async ({ path: filePath }) => {
  const MAX_PLAIN = 100 * 1024;
  try {
    const size = await fileSize(targetDir, filePath);
    if (size > MAX_PLAIN) return { content: '', tooLarge: true };
  } catch {
    return { content: '', tooLarge: false };
  }
  const content = await readFile(targetDir, filePath);
  const highlight = await highlightCode(content, filePath);
  return { content, highlight };
});

registerRpc('readFile', async ({ path }) => {
  return readFile(targetDir, path);
});

registerRpc('getConfig', async () => loadConfig());

registerRpc('getTheme', async () => loadFullTheme().colors);

registerRpc('commitFiles', async ({ paths, message }) => {
  const commitMessage = await generateCommitMessage(targetDir, paths, message);
  await commitFiles(targetDir, paths, commitMessage);
});

registerRpc('searchContent', async ({ query }) => {
  await ensureGitRepo();
  return searchContent(targetDir, query);
});

registerRpc('callLlm', async ({ prompt }) => callLlmNoTools(targetDir, prompt));

registerRpc('getCurrentFolder', async () => targetDir);

registerRpc('getKnownFolders', async () => getKnownFolders());

registerRpc('addKnownFolder', async ({ folder }) => addKnownFolder(folder));

registerRpc('removeKnownFolder', async ({ folder }) => removeKnownFolder(folder));

registerRpc('getActiveFolders', async () => getActiveFolders());

registerRpc('addActiveFolder', async ({ folder }) => addActiveFolder(folder));

registerRpc('removeActiveFolder', async ({ folder }) => removeActiveFolder(folder));

registerRpc('changeFolder', async ({ folder }) => {
  const resolved = path.resolve(folder);
  if (!fs.existsSync(resolved)) throw new Error(`Folder does not exist: ${resolved}`);

  // Update targetDir and reset git repo cache
  targetDir = resolved;
  cachedIsGitRepo = null;

  // Recreate watcher
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  try {
    watcher = await createWatcher(targetDir, () => pushToAllWindows('gitChanged'));
  } catch {
    // Not a git repo or watch failed — that's ok, renderer will show the error
  }

  // Update window titles
  for (const win of BrowserWindow.getAllWindows()) {
    win.setTitle(`Code Review — ${targetDir}`);
  }

  // Notify renderer to reload everything
  pushToAllWindows('folderChanged', { folder: targetDir });
});

registerRpc('pickFolder', async () => {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (!focusedWindow) return null;

  const result = await dialog.showOpenDialog(focusedWindow, {
    properties: ['openDirectory'],
    title: 'Select folder',
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

function pushToAllWindows(event: string, payload?: any) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('push', event, payload);
  }
}

function watchThemeFile() {
  const config = loadConfig();
  if (!config.pathToTheme) return;

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    fs.watch(config.pathToTheme, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        updateHighlighterTheme(loadFullTheme()).catch(() => {});
        pushToAllWindows('themeChanged');
      }, 200);
    });
  } catch {
    // file doesn't exist yet — ignore
  }
}

let watcher: Watcher | null = null;

app.whenReady().then(async () => {
  await initHighlighter(loadFullTheme());

  createWindow();

  watcher = await createWatcher(targetDir, () => pushToAllWindows('gitChanged'));
  watchThemeFile();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  watcher?.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

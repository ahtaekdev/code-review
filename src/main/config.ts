import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DEFAULT_CONFIG, type AppConfig } from '../shared/config';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'code-review');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    cached = {
      shortcuts: { ...DEFAULT_CONFIG.shortcuts, ...parsed.shortcuts },
      pathToTheme: parsed.pathToTheme ?? DEFAULT_CONFIG.pathToTheme,
      knownFolders: Array.isArray(parsed.knownFolders) ? parsed.knownFolders : [],
      activeFolders: Array.isArray(parsed.activeFolders) ? parsed.activeFolders : [],
    };
  } catch {
    cached = { ...DEFAULT_CONFIG, knownFolders: [], activeFolders: [] };
  }
  return cached;
}

export function saveConfig(config: AppConfig): void {
  cached = config;
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  } catch {
    // best-effort save
  }
}

export function getKnownFolders(): string[] {
  return loadConfig().knownFolders ?? [];
}

export function addKnownFolder(folder: string): string[] {
  const config = loadConfig();
  const folders = config.knownFolders ?? [];
  if (!folders.includes(folder)) {
    folders.push(folder);
    folders.sort();
  }
  config.knownFolders = folders;
  saveConfig(config);
  return folders;
}

export function removeKnownFolder(folder: string): string[] {
  const config = loadConfig();
  const folders = (config.knownFolders ?? []).filter((f) => f !== folder);
  config.knownFolders = folders;
  // Also remove from active folders if present
  config.activeFolders = (config.activeFolders ?? []).filter((f) => f !== folder);
  saveConfig(config);
  return folders;
}

export function getActiveFolders(): string[] {
  return loadConfig().activeFolders ?? [];
}

export function addActiveFolder(folder: string): string[] {
  const config = loadConfig();
  const folders = config.activeFolders ?? [];
  if (!folders.includes(folder)) {
    folders.push(folder);
  }
  config.activeFolders = folders;
  saveConfig(config);
  return folders;
}

export function removeActiveFolder(folder: string): string[] {
  const config = loadConfig();
  const folders = (config.activeFolders ?? []).filter((f) => f !== folder);
  config.activeFolders = folders;
  saveConfig(config);
  return folders;
}

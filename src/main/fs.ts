import * as fs from 'fs/promises';
import * as path from 'path';

export async function fileSize(
  baseDir: string,
  filePath: string,
): Promise<number> {
  const resolved = path.resolve(baseDir, filePath);
  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error('Path traversal not allowed');
  }
  const stat = await fs.stat(resolved);
  return stat.size;
}

export async function readFile(
  baseDir: string,
  filePath: string,
): Promise<string> {
  const resolved = path.resolve(baseDir, filePath);
  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error('Path traversal not allowed');
  }
  return fs.readFile(resolved, 'utf-8');
}

/**
 * Minimal word-level diff using LCS (Longest Common Subsequence).
 * Inspired by jsdiff (BSD License, https://github.com/kpdecker/jsdiff).
 * Only implements diffWordsWithSpace — the subset we need.
 */

export interface Change {
  value: string;
  added: boolean;
  removed: boolean;
}

const TOKEN_RE = /\r?\n|[\p{L}\p{N}_]+|[^\S\r\n]+|[^\p{L}\p{N}_\s]/gu;

function tokenize(text: string): string[] {
  return text.match(TOKEN_RE) || [];
}

function diffTokens(oldTokens: string[], newTokens: string[]): Change[] {
  const m = oldTokens.length;
  const n = newTokens.length;

  if (m === 0 && n === 0) return [];
  if (m === 0) return [{ value: newTokens.join(''), added: true, removed: false }];
  if (n === 0) return [{ value: oldTokens.join(''), added: false, removed: true }];

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldTokens[i - 1] === newTokens[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const raw: Array<{ type: 'keep' | 'del' | 'ins'; token: string }> = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      raw.push({ type: 'keep', token: oldTokens[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ type: 'ins', token: newTokens[j - 1] });
      j--;
    } else {
      raw.push({ type: 'del', token: oldTokens[i - 1] });
      i--;
    }
  }
  raw.reverse();

  const changes: Change[] = [];
  for (const r of raw) {
    const added = r.type === 'ins';
    const removed = r.type === 'del';
    const last = changes[changes.length - 1];
    if (last && last.added === added && last.removed === removed) {
      last.value += r.token;
    } else {
      changes.push({ value: r.token, added, removed });
    }
  }
  return changes;
}

export function diffWordsWithSpace(oldStr: string, newStr: string): Change[] {
  if (oldStr === newStr) {
    return oldStr ? [{ value: oldStr, added: false, removed: false }] : [];
  }
  return diffTokens(tokenize(oldStr), tokenize(newStr));
}

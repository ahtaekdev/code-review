// --- Fuzzy matching ---------------------------------------------------------
//
// Path-oriented fuzzy matcher used by the file picker.
//
// The matcher supports:
//   1. Multi-token queries (whitespace-separated) matched in any order.
//   2. Per-token strict subsequence matching (fast path, high-quality scoring).
//   3. Per-token approximate substring matching with bounded edit distance,
//      so typos / transpositions like "sevrless" -> "serverless" still match
//      (ranked below clean hits via an error penalty).
//
// Example: query "sevrless.yml acme-b" should match
//   app/something/acme-service-b/serverless.yml
// because each token individually matches the path, even though "sevrless"
// requires edits relative to "serverless" and the two tokens hit different
// regions of the path.

export interface FuzzyMatchResult {
  /** Aggregate score; higher is better. */
  score: number;
  /** Indices into the target string that were matched (for highlighting). */
  matches: number[];
}

interface TokenMatch {
  score: number;
  matches: number[]; // indices into the target
  errors: number;
}

function strictSubsequenceTokenMatch(token: string, target: string): TokenMatch | null {
  const lowerToken = token.toLowerCase();
  const lowerTarget = target.toLowerCase();
  const matches: number[] = [];
  const lastSlash = target.lastIndexOf('/');
  let qi = 0;
  let score = 0;
  let prevMatchIdx = -2;

  for (let ti = 0; ti < lowerTarget.length && qi < lowerToken.length; ti++) {
    if (lowerTarget[ti] === lowerToken[qi]) {
      matches.push(ti);
      // consecutive match bonus
      if (ti === prevMatchIdx + 1) score += 5;
      // filename match bonus (after last '/')
      if (ti > lastSlash) score += 3;
      // start-of-segment bonus (after '/' or at start)
      if (ti === 0 || target[ti - 1] === '/') score += 8;
      score += 1;
      prevMatchIdx = ti;
      qi++;
    }
  }

  if (qi < lowerToken.length) return null;
  return { score, matches, errors: 0 };
}

// Approximate substring matcher using Levenshtein-style DP where the first
// DP row is zeroed (free start anywhere in target). Returns the alignment
// with the fewest edits and back-traces matched positions for highlighting.
function approximateSubstringTokenMatch(
  token: string,
  target: string,
  maxErrors: number,
): TokenMatch | null {
  const lowerToken = token.toLowerCase();
  const lowerTarget = target.toLowerCase();
  const m = lowerToken.length;
  const n = lowerTarget.length;
  if (m === 0 || n === 0) return null;

  // dp[i][j] = min edits to align token[0..i] ending at target[..j].
  // Free start: dp[0][j] = 0 for all j (the alignment can begin anywhere).
  const dp: number[][] = new Array(m + 1);
  for (let i = 0; i <= m; i++) {
    dp[i] = new Array(n + 1);
    dp[i][0] = i; // must "delete" i token chars when target prefix is empty
  }
  for (let j = 0; j <= n; j++) dp[0][j] = 0;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = lowerToken[i - 1] === lowerTarget[j - 1] ? 0 : 1;
      const sub = dp[i - 1][j - 1] + cost;
      const del = dp[i - 1][j] + 1;
      const ins = dp[i][j - 1] + 1;
      let best = sub < del ? sub : del;
      if (ins < best) best = ins;
      dp[i][j] = best;
    }
  }

  // Best alignment end position in target.
  let minErr = Infinity;
  let bestEnd = -1;
  for (let j = 1; j <= n; j++) {
    if (dp[m][j] < minErr) {
      minErr = dp[m][j];
      bestEnd = j;
    }
  }
  if (bestEnd < 0 || minErr > maxErrors) return null;

  // Back-trace, recording target indices that participated in an exact match.
  const matches: number[] = [];
  let i = m;
  let j = bestEnd;
  while (i > 0 && j > 0) {
    const cur = dp[i][j];
    const charsEqual = lowerToken[i - 1] === lowerTarget[j - 1];
    if (charsEqual && cur === dp[i - 1][j - 1]) {
      matches.push(j - 1);
      i--;
      j--;
    } else if (cur === dp[i - 1][j - 1] + 1) {
      // substitution
      i--;
      j--;
    } else if (cur === dp[i - 1][j] + 1) {
      // deletion from token (skip token char)
      i--;
    } else {
      // insertion into token (skip target char)
      j--;
    }
  }
  matches.reverse();

  // Score using the same segment-aware bonuses, but only for actually matched
  // (non-edited) characters.
  const lastSlash = target.lastIndexOf('/');
  let score = 0;
  let prev = -2;
  for (const idx of matches) {
    if (idx === prev + 1) score += 5;
    if (idx > lastSlash) score += 3;
    if (idx === 0 || target[idx - 1] === '/') score += 8;
    score += 1;
    prev = idx;
  }
  return { score, matches, errors: minErr };
}

function fuzzyMatchToken(token: string, target: string): TokenMatch | null {
  const strict = strictSubsequenceTokenMatch(token, target);
  if (strict) return strict;
  // Short tokens are too noisy to fuzz: a 2-char token with k=1 would match
  // virtually any path. Require at least 3 chars before allowing edits.
  if (token.length < 3) return null;
  const k = Math.max(1, Math.floor(token.length / 4));
  return approximateSubstringTokenMatch(token, target, k);
}

// Penalty applied per edit when aggregating token scores. Tuned so a fuzzy
// hit with errors ranks below a clean strict hit, but stays in the result set.
const ERROR_PENALTY = 15;

/**
 * Match a query against a target path.
 *
 * The query is split on whitespace; each token must match somewhere in the
 * target (in any order). Tokens prefer strict subsequence matching, then fall
 * back to bounded edit-distance matching. Returns `null` if any token fails.
 */
export function fuzzyMatch(query: string, target: string): FuzzyMatchResult | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const tokens = trimmed.split(/\s+/);

  const matchSet = new Set<number>();
  let totalScore = 0;

  // Big bonus when the whole query (spaces collapsed) appears contiguously
  // somewhere in the path. Keeps "obvious" matches pinned to the top.
  const collapsed = trimmed.replace(/\s+/g, '').toLowerCase();
  const lowerTarget = target.toLowerCase();
  if (collapsed.length > 0 && lowerTarget.includes(collapsed)) {
    totalScore += 50;
  }

  for (const token of tokens) {
    const m = fuzzyMatchToken(token, target);
    if (!m) return null;
    totalScore += m.score - m.errors * ERROR_PENALTY;
    for (const idx of m.matches) matchSet.add(idx);
  }

  // Penalize longer paths slightly so shorter, more specific paths win ties.
  totalScore -= target.length * 0.1;

  const matches = Array.from(matchSet).sort((a, b) => a - b);
  return { score: totalScore, matches };
}

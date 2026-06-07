import type { CompareMode, DiffHunk, FileDiff } from '../shared/rpc';

export const DEFAULT_CONTEXT_LINES = 3;
export const GAP_REVEAL_LINES = 15;
export const DIFF_GAP_STATE_VERSION = 1;

export type GapRevealSide = 'top' | 'bottom';

export interface DiffGap {
  id: string;
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
  initialHiddenOldStart: number;
  initialHiddenOldEnd: number;
  initialHiddenNewStart: number;
  initialHiddenNewEnd: number;
  hiddenOldStart: number;
  hiddenOldEnd: number;
  hiddenNewStart: number;
  hiddenNewEnd: number;
}

export interface DiffGapState {
  version: typeof DIFF_GAP_STATE_VERSION;
  contextLines: number;
  fingerprint: string;
  gaps: DiffGap[];
}

export type DiffRenderSection =
  | { kind: 'context'; key: string; oldStart: number; newStart: number; count: number }
  | { kind: 'gap'; key: string; gap: DiffGap }
  | { kind: 'hunk'; key: string; hunk: DiffHunk; hunkIndex: number };

export function makeDiffGapKey(
  path: string,
  fileType: 'tracked' | 'untracked' | null,
  compareMode: CompareMode,
): string {
  return `${compareMode}\u0000${fileType ?? 'tracked'}\u0000${path}`;
}

function lineCount(text: string | null): number {
  return text == null ? 0 : text.split('\n').length;
}

function rangeLength(start: number, end: number): number {
  return Math.max(0, end - start + 1);
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function diffFingerprint(diff: FileDiff): string {
  const hunkShape = diff.hunks.map((h) => ({
    oldStart: h.oldStart,
    oldCount: h.oldCount,
    newStart: h.newStart,
    newCount: h.newCount,
    heading: h.heading,
    lines: h.lines.map((l) => ({
      type: l.type,
      oldNo: l.oldNo,
      newNo: l.newNo,
      content: l.content,
    })),
  }));

  return hashString(JSON.stringify({
    hunks: hunkShape,
    oldLength: diff.oldFile?.length ?? -1,
    oldHash: diff.oldFile == null ? null : hashString(diff.oldFile),
    newLength: diff.newFile?.length ?? -1,
    newHash: diff.newFile == null ? null : hashString(diff.newFile),
  }));
}

function lineBeforeHunkOld(hunk: DiffHunk): number {
  return hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1;
}

function lineBeforeHunkNew(hunk: DiffHunk): number {
  return hunk.newCount === 0 ? hunk.newStart : hunk.newStart - 1;
}

function lineAfterHunkOld(hunk: DiffHunk): number {
  return hunk.oldStart + (hunk.oldCount === 0 ? 1 : hunk.oldCount);
}

function lineAfterHunkNew(hunk: DiffHunk): number {
  return hunk.newStart + (hunk.newCount === 0 ? 1 : hunk.newCount);
}

function makeEmptyOldHidden(gap: Pick<DiffGap, 'oldEnd'>): { start: number; end: number } {
  return { start: gap.oldEnd + 1, end: gap.oldEnd };
}

function makeEmptyNewHidden(gap: Pick<DiffGap, 'newEnd'>): { start: number; end: number } {
  return { start: gap.newEnd + 1, end: gap.newEnd };
}

function createGap(
  id: string,
  oldStart: number,
  oldEnd: number,
  newStart: number,
  newEnd: number,
  position: 'before-first' | 'between' | 'after-last',
  contextLines: number,
): DiffGap | null {
  const oldLen = rangeLength(oldStart, oldEnd);
  const newLen = rangeLength(newStart, newEnd);
  const len = Math.max(oldLen, newLen);
  if (len <= 0) return null;

  const leadingVisible = position === 'before-first'
    ? 0
    : Math.min(contextLines, len);
  const trailingVisible = position === 'after-last'
    ? 0
    : Math.min(contextLines, Math.max(0, len - leadingVisible));

  const hiddenLen = Math.max(0, len - leadingVisible - trailingVisible);

  const base: DiffGap = {
    id,
    oldStart,
    oldEnd,
    newStart,
    newEnd,
    initialHiddenOldStart: oldEnd + 1,
    initialHiddenOldEnd: oldEnd,
    initialHiddenNewStart: newEnd + 1,
    initialHiddenNewEnd: newEnd,
    hiddenOldStart: oldEnd + 1,
    hiddenOldEnd: oldEnd,
    hiddenNewStart: newEnd + 1,
    hiddenNewEnd: newEnd,
  };

  if (hiddenLen <= 0) return base;

  const oldHiddenStart = oldStart + Math.min(leadingVisible, oldLen);
  const newHiddenStart = newStart + Math.min(leadingVisible, newLen);
  const oldHiddenEnd = oldEnd - Math.min(trailingVisible, oldLen);
  const newHiddenEnd = newEnd - Math.min(trailingVisible, newLen);

  return {
    ...base,
    initialHiddenOldStart: oldHiddenStart,
    initialHiddenOldEnd: oldHiddenEnd,
    initialHiddenNewStart: newHiddenStart,
    initialHiddenNewEnd: newHiddenEnd,
    hiddenOldStart: oldHiddenStart,
    hiddenOldEnd: oldHiddenEnd,
    hiddenNewStart: newHiddenStart,
    hiddenNewEnd: newHiddenEnd,
  };
}

export function buildInitialGapState(
  diff: FileDiff,
  contextLines = DEFAULT_CONTEXT_LINES,
): DiffGapState {
  const oldLineCount = lineCount(diff.oldFile);
  const newLineCount = lineCount(diff.newFile);
  const gaps: DiffGap[] = [];
  const hunks = diff.hunks;

  for (let h = 0; h <= hunks.length; h++) {
    let oldStart: number;
    let oldEnd: number;
    let newStart: number;
    let newEnd: number;
    let position: 'before-first' | 'between' | 'after-last';

    if (h === 0) {
      oldStart = 1;
      newStart = 1;
      oldEnd = hunks.length > 0 ? lineBeforeHunkOld(hunks[0]) : oldLineCount;
      newEnd = hunks.length > 0 ? lineBeforeHunkNew(hunks[0]) : newLineCount;
      position = 'before-first';
    } else if (h === hunks.length) {
      const prev = hunks[h - 1];
      oldStart = lineAfterHunkOld(prev);
      newStart = lineAfterHunkNew(prev);
      oldEnd = oldLineCount;
      newEnd = newLineCount;
      position = 'after-last';
    } else {
      const prev = hunks[h - 1];
      const next = hunks[h];
      oldStart = lineAfterHunkOld(prev);
      newStart = lineAfterHunkNew(prev);
      oldEnd = lineBeforeHunkOld(next);
      newEnd = lineBeforeHunkNew(next);
      position = 'between';
    }

    const gap = createGap(`gap-${h}`, oldStart, oldEnd, newStart, newEnd, position, contextLines);
    if (gap) gaps.push(gap);
  }

  return {
    version: DIFF_GAP_STATE_VERSION,
    contextLines,
    fingerprint: diffFingerprint(diff),
    gaps,
  };
}

export function getGapHiddenCount(gap: DiffGap): number {
  return Math.max(
    rangeLength(gap.hiddenOldStart, gap.hiddenOldEnd),
    rangeLength(gap.hiddenNewStart, gap.hiddenNewEnd),
  );
}

export function isGapHidden(gap: DiffGap): boolean {
  return getGapHiddenCount(gap) > 0;
}

export function isGapPartiallyRevealed(gap: DiffGap): boolean {
  return gap.hiddenOldStart !== gap.initialHiddenOldStart
    || gap.hiddenOldEnd !== gap.initialHiddenOldEnd
    || gap.hiddenNewStart !== gap.initialHiddenNewStart
    || gap.hiddenNewEnd !== gap.initialHiddenNewEnd;
}

export function gapHiddenRangeLabel(gap: DiffGap, side: 'old' | 'new' | 'new-preferred' = 'new-preferred'): string {
  const useNew = side === 'new' || (side === 'new-preferred' && rangeLength(gap.hiddenNewStart, gap.hiddenNewEnd) > 0);
  const start = useNew ? gap.hiddenNewStart : gap.hiddenOldStart;
  const end = useNew ? gap.hiddenNewEnd : gap.hiddenOldEnd;
  if (start > end) return '';
  return start === end ? `line ${start}` : `lines ${start}–${end}`;
}

function revealGap(gap: DiffGap, side: GapRevealSide, count: number): DiffGap {
  const hiddenCount = getGapHiddenCount(gap);
  if (hiddenCount <= 0) return gap;
  const amount = Math.min(count, hiddenCount);
  if (amount >= hiddenCount) return revealAllGap(gap);

  if (side === 'top') {
    return {
      ...gap,
      hiddenOldStart: gap.hiddenOldStart <= gap.hiddenOldEnd ? gap.hiddenOldStart + Math.min(amount, rangeLength(gap.hiddenOldStart, gap.hiddenOldEnd)) : gap.hiddenOldStart,
      hiddenNewStart: gap.hiddenNewStart <= gap.hiddenNewEnd ? gap.hiddenNewStart + Math.min(amount, rangeLength(gap.hiddenNewStart, gap.hiddenNewEnd)) : gap.hiddenNewStart,
    };
  }

  return {
    ...gap,
    hiddenOldEnd: gap.hiddenOldStart <= gap.hiddenOldEnd ? gap.hiddenOldEnd - Math.min(amount, rangeLength(gap.hiddenOldStart, gap.hiddenOldEnd)) : gap.hiddenOldEnd,
    hiddenNewEnd: gap.hiddenNewStart <= gap.hiddenNewEnd ? gap.hiddenNewEnd - Math.min(amount, rangeLength(gap.hiddenNewStart, gap.hiddenNewEnd)) : gap.hiddenNewEnd,
  };
}

function revealAllGap(gap: DiffGap): DiffGap {
  const oldHidden = makeEmptyOldHidden(gap);
  const newHidden = makeEmptyNewHidden(gap);
  return {
    ...gap,
    hiddenOldStart: oldHidden.start,
    hiddenOldEnd: oldHidden.end,
    hiddenNewStart: newHidden.start,
    hiddenNewEnd: newHidden.end,
  };
}

function resetGap(gap: DiffGap): DiffGap {
  return {
    ...gap,
    hiddenOldStart: gap.initialHiddenOldStart,
    hiddenOldEnd: gap.initialHiddenOldEnd,
    hiddenNewStart: gap.initialHiddenNewStart,
    hiddenNewEnd: gap.initialHiddenNewEnd,
  };
}

export function revealGapLinesInState(
  state: DiffGapState,
  gapId: string,
  side: GapRevealSide,
  count = GAP_REVEAL_LINES,
): DiffGapState {
  return {
    ...state,
    gaps: state.gaps.map((gap) => gap.id === gapId ? revealGap(gap, side, count) : gap),
  };
}

export function revealAllGapInState(state: DiffGapState, gapId: string): DiffGapState {
  return {
    ...state,
    gaps: state.gaps.map((gap) => gap.id === gapId ? revealAllGap(gap) : gap),
  };
}

export function resetGapInState(state: DiffGapState, gapId: string): DiffGapState {
  return {
    ...state,
    gaps: state.gaps.map((gap) => gap.id === gapId ? resetGap(gap) : gap),
  };
}

export function toggleAllGapsInState(state: DiffGapState): DiffGapState {
  const hasHidden = state.gaps.some(isGapHidden);
  return {
    ...state,
    gaps: state.gaps.map((gap) => hasHidden ? revealAllGap(gap) : resetGap(gap)),
  };
}

function contextSection(
  key: string,
  oldStart: number,
  oldEnd: number,
  newStart: number,
  newEnd: number,
): DiffRenderSection | null {
  const count = Math.max(rangeLength(oldStart, oldEnd), rangeLength(newStart, newEnd));
  if (count <= 0) return null;
  return { kind: 'context', key, oldStart, newStart, count };
}

function gapSections(gap: DiffGap): DiffRenderSection[] {
  if (!isGapHidden(gap)) {
    const section = contextSection(`ctx-${gap.id}-all`, gap.oldStart, gap.oldEnd, gap.newStart, gap.newEnd);
    return section ? [section] : [];
  }

  const sections: DiffRenderSection[] = [];
  const before = contextSection(
    `ctx-${gap.id}-before`,
    gap.oldStart,
    gap.hiddenOldStart - 1,
    gap.newStart,
    gap.hiddenNewStart - 1,
  );
  if (before) sections.push(before);
  sections.push({ kind: 'gap', key: gap.id, gap });
  const after = contextSection(
    `ctx-${gap.id}-after`,
    gap.hiddenOldEnd + 1,
    gap.oldEnd,
    gap.hiddenNewEnd + 1,
    gap.newEnd,
  );
  if (after) sections.push(after);
  return sections;
}

export function buildDiffRenderSections(hunks: DiffHunk[], gapState: DiffGapState | null | undefined): DiffRenderSection[] {
  const sections: DiffRenderSection[] = [];
  const gapsById = new Map((gapState?.gaps ?? []).map((gap) => [gap.id, gap]));

  for (let h = 0; h <= hunks.length; h++) {
    const gap = gapsById.get(`gap-${h}`);
    if (gap) sections.push(...gapSections(gap));
    if (h < hunks.length) {
      sections.push({ kind: 'hunk', key: `hunk-${h}`, hunk: hunks[h], hunkIndex: h });
    }
  }

  return sections;
}

export function visibleGapIds(hunks: DiffHunk[], gapState: DiffGapState | null | undefined): string[] {
  return buildDiffRenderSections(hunks, gapState)
    .filter((section): section is Extract<DiffRenderSection, { kind: 'gap' }> => section.kind === 'gap')
    .map((section) => section.gap.id);
}

export function gapShortcutNumbers(hunks: DiffHunk[], gapState: DiffGapState | null | undefined): Record<string, number> {
  const result: Record<string, number> = {};
  visibleGapIds(hunks, gapState).slice(0, 9).forEach((gapId, idx) => {
    result[gapId] = idx + 1;
  });
  return result;
}

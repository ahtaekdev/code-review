import React, { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { useAppSelector, useAppDispatch, selectActiveView, selectActiveFilePath, selectActiveGapState, selectActiveDiffScrollTop, revealGapLines, revealAllGap, resetGap, saveDiffScrollPosition, addReviewComment, isStaleGit } from './store';
import { matchesShortcut, formatShortcut } from './shortcuts';
import { formatReviewComments } from './reviewComments';
import type { DiffMode, ReviewComment } from './store';
import { MONO_FONT } from '../shared/theme';
import { UnifiedView } from './UnifiedView';
import { SplitView } from './SplitView';
import { gapShortcutNumbers as buildGapShortcutNumbers, getGapHiddenCount, visibleGapIds as getVisibleGapIds } from './diffGaps';
import { NewestView } from './NewestView';
import { PlainView } from './PlainView';

const MODE_LABELS: Record<DiffMode, string> = {
  unified: 'Unified',
  split: 'Split',
  newest: 'Newest',
};

const SELECTION_BG = 'color-mix(in srgb, var(--cr-accent-fg) 18%, transparent)';

interface CommentDraftBoxProps {
  lines: { start: number; end: number };
  filePath: string;
  newFile: string | null | undefined;
  plainContent: string | null | undefined;
  submitShortcut: string;
  copyShortcut: string;
  onSubmit: (comment: ReviewComment) => void;
  onCancel: () => void;
}

function getLineNoFromEvent(e: MouseEvent | React.MouseEvent): number | null {
  const el = e.target as HTMLElement;
  const lineNo = el.getAttribute('data-line-no');
  return lineNo != null ? parseInt(lineNo, 10) : null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function shortcutNumberFromEvent(e: KeyboardEvent): number | null {
  const digitMatch = /^Digit([1-9])$/.exec(e.code);
  if (digitMatch) return parseInt(digitMatch[1], 10);
  const numpadMatch = /^Numpad([1-9])$/.exec(e.code);
  if (numpadMatch) return parseInt(numpadMatch[1], 10);
  return null;
}

function getCodeSnippet(
  newFile: string | null | undefined,
  plainContent: string | null | undefined,
  startLine: number,
  endLine: number,
): string {
  const text = newFile ?? plainContent ?? '';
  const lines = text.split(/\r?\n/);
  return lines.slice(startLine - 1, endLine).join('\n');
}

const CommentDraftBox: React.FC<CommentDraftBoxProps> = React.memo(({
  lines,
  filePath,
  newFile,
  plainContent,
  submitShortcut,
  copyShortcut,
  onSubmit,
  onCancel,
}) => {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasDraft = draft.trim().length > 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const buildComment = useCallback((): ReviewComment | null => {
    const trimmed = draft.trim();
    if (!trimmed) return null;
    const snippet = getCodeSnippet(newFile, plainContent, lines.start, lines.end);
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      filePath,
      startLine: lines.start,
      endLine: lines.end,
      codeSnippet: snippet,
      comment: trimmed,
    };
  }, [draft, filePath, lines, newFile, plainContent]);

  const submitDraft = useCallback(() => {
    const comment = buildComment();
    if (comment) onSubmit(comment);
  }, [buildComment, onSubmit]);

  const copyDraft = useCallback(() => {
    const comment = buildComment();
    if (comment) navigator.clipboard.writeText(formatReviewComments([comment]));
  }, [buildComment]);

  return (
    <div style={{
      margin: '4px 16px 16px',
      border: '1px solid var(--cr-border)',
      borderRadius: 6,
      background: 'var(--cr-bg)',
      padding: 12,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    }}>
      <div style={{ fontSize: 12, color: 'var(--cr-muted-fg)', marginBottom: 6 }}>
        Comment on {lines.start === lines.end
          ? `line ${lines.start}`
          : `lines ${lines.start}-${lines.end}`}
      </div>
      <textarea
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (matchesShortcut(e.nativeEvent, copyShortcut)) {
            if (e.currentTarget.selectionStart !== e.currentTarget.selectionEnd) return;
            if (hasDraft) {
              e.preventDefault();
              e.stopPropagation();
              copyDraft();
            }
            return;
          }

          if (matchesShortcut(e.nativeEvent, submitShortcut)) {
            e.preventDefault();
            submitDraft();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder="Write your review comment..."
        style={{
          width: '100%',
          boxSizing: 'border-box',
          minHeight: 60,
          padding: '8px 10px',
          fontSize: 13,
          fontFamily: 'system-ui, sans-serif',
          background: 'color-mix(in srgb, var(--cr-bg) 80%, var(--cr-fg) 20%)',
          color: 'var(--cr-fg)',
          border: '1px solid var(--cr-border)',
          borderRadius: 4,
          outline: 'none',
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '4px 12px',
            fontSize: 12,
            border: '1px solid var(--cr-border)',
            borderRadius: 4,
            cursor: 'pointer',
            background: 'transparent',
            color: 'var(--cr-muted-fg)',
          }}
        >
          Cancel
        </button>
        <button
          onClick={submitDraft}
          disabled={!hasDraft}
          style={{
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 600,
            border: '1px solid var(--cr-border)',
            borderRadius: 4,
            cursor: hasDraft ? 'pointer' : 'default',
            background: hasDraft ? 'var(--cr-accent-bg)' : 'transparent',
            color: hasDraft ? 'var(--cr-accent-fg)' : 'var(--cr-muted-fg)',
          }}
        >
          Add Comment ({formatShortcut(submitShortcut)})
        </button>
      </div>
    </div>
  );
});

export const DiffPanel: React.FC = () => {
  const dispatch = useAppDispatch();
  const view = useAppSelector(selectActiveView);
  const filePath = useAppSelector(selectActiveFilePath);
  const shortcuts = useAppSelector((s) => s.config.data.shortcuts);
  const diffMode = useAppSelector((s) => s.ui.diffMode);
  const compareMode = useAppSelector((s) => s.ui.compareMode);
  const compareBase = useAppSelector((s) => s.gitStatus.data?.baseBranch);
  const gapState = useAppSelector(selectActiveGapState);
  const savedScrollTop = useAppSelector(selectActiveDiffScrollTop);
  const gapShortcutsBlocked = useAppSelector((s) =>
    s.ui.configModalOpen
    || s.ui.fuzzySearchOpen
    || s.ui.contentSearchOpen
    || s.ui.reviewModalOpen
    || s.ui.folderPickerOpen,
  );
  const activeDiffHunks = view?.viewMode === 'diff' && view.fileDiff && !view.fileDiff.tooLarge
    ? view.fileDiff.hunks
    : null;
  const visibleShortcutGapIds = React.useMemo(
    () => activeDiffHunks ? getVisibleGapIds(activeDiffHunks, gapState).slice(0, 9) : [],
    [activeDiffHunks, gapState],
  );
  const gapShortcutNumbers = React.useMemo(
    () => activeDiffHunks ? buildGapShortcutNumbers(activeDiffHunks, gapState) : {},
    [activeDiffHunks, gapState],
  );
  const activeScrollKey = view?.gapKey ?? null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTopRef = useRef<number | null>(null);
  const pendingScrollSaveRef = useRef<{ key: string; top: number } | null>(null);
  const scrollSaveRafRef = useRef<number | null>(null);
  const restoringScrollRef = useRef(false);
  const [selecting, setSelecting] = useState(false);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [commentBoxLines, setCommentBoxLines] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    savedScrollTopRef.current = savedScrollTop;
  }, [savedScrollTop]);

  useEffect(() => () => {
    if (scrollSaveRafRef.current != null) {
      cancelAnimationFrame(scrollSaveRafRef.current);
      scrollSaveRafRef.current = null;
    }
    const pending = pendingScrollSaveRef.current;
    if (pending) dispatch(saveDiffScrollPosition(pending));
  }, [dispatch]);

  useLayoutEffect(() => {
    if (!activeScrollKey || view?.loading) return;
    const top = savedScrollTopRef.current ?? 0;
    const frames: number[] = [];
    let remainingFrames = 6;
    let cancelled = false;
    restoringScrollRef.current = true;

    const restore = () => {
      if (cancelled) return;
      const container = scrollRef.current;
      if (container) {
        container.scrollTop = top;
        container.querySelectorAll<HTMLElement>('[data-split-scroll]').forEach((el) => {
          el.scrollTop = top;
        });
      }

      remainingFrames--;
      if (remainingFrames > 0) {
        frames.push(requestAnimationFrame(restore));
      } else {
        restoringScrollRef.current = false;
      }
    };

    restore();

    return () => {
      cancelled = true;
      restoringScrollRef.current = false;
      frames.forEach((frame) => cancelAnimationFrame(frame));
    };
  }, [activeScrollKey, diffMode, view?.loading]);

  const handleDiffScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!activeScrollKey || restoringScrollRef.current) return;
    const target = e.target as HTMLElement;
    const container = scrollRef.current;
    if (!container) return;

    let top: number | null = null;
    if (target === container) {
      top = container.scrollTop;
    } else {
      const splitScroller = target.closest?.('[data-split-scroll]') as HTMLElement | null;
      if (splitScroller && container.contains(splitScroller)) {
        top = splitScroller.scrollTop;
      }
    }
    if (top == null) return;

    pendingScrollSaveRef.current = { key: activeScrollKey, top };
    if (scrollSaveRafRef.current != null) return;

    scrollSaveRafRef.current = requestAnimationFrame(() => {
      scrollSaveRafRef.current = null;
      const pending = pendingScrollSaveRef.current;
      if (pending) dispatch(saveDiffScrollPosition(pending));
    });
  }, [activeScrollKey, dispatch]);

  useEffect(() => {
    if (gapShortcutsBlocked || commentBoxLines || visibleShortcutGapIds.length === 0) return;

    const handleGapShortcut = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target) || e.altKey || e.metaKey) return;
      const shortcutNumber = shortcutNumberFromEvent(e);
      if (shortcutNumber == null) return;

      const gapId = visibleShortcutGapIds[shortcutNumber - 1];
      if (!gapId) return;

      if (e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        const gap = gapState?.gaps.find((g) => g.id === gapId);
        if (gap && getGapHiddenCount(gap) === 0) {
          dispatch(resetGap(gapId));
        } else {
          dispatch(revealAllGap(gapId));
        }
      } else if (e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        dispatch(revealGapLines({ gapId, side: 'bottom' }));
      } else if (!e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        dispatch(revealGapLines({ gapId, side: 'top' }));
      }
    };

    window.addEventListener('keydown', handleGapShortcut);
    return () => window.removeEventListener('keydown', handleGapShortcut);
  }, [commentBoxLines, dispatch, gapShortcutsBlocked, gapState, visibleShortcutGapIds]);

  // clear selection when active file changes
  useEffect(() => {
    setSelecting(false);
    setSelStart(null);
    setSelEnd(null);
    setCommentBoxLines(null);
  }, [filePath]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const line = getLineNoFromEvent(e);
    if (line == null) return;
    e.preventDefault();
    setSelecting(true);
    setSelStart(line);
    setSelEnd(line);
    setCommentBoxLines(null);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!selecting) return;
    const line = getLineNoFromEvent(e);
    if (line != null) setSelEnd(line);
  }, [selecting]);

  const handleMouseUp = useCallback(() => {
    if (!selecting || selStart == null || selEnd == null) return;
    setSelecting(false);
    const start = Math.min(selStart, selEnd);
    const end = Math.max(selStart, selEnd);
    setCommentBoxLines({ start, end });
  }, [selecting, selStart, selEnd]);

  // global mouseup to catch release outside the panel
  useEffect(() => {
    if (!selecting) return;
    const onUp = () => {
      if (selStart != null && selEnd != null) {
        setSelecting(false);
        const start = Math.min(selStart, selEnd);
        const end = Math.max(selStart, selEnd);
        setCommentBoxLines({ start, end });
      }
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [selecting, selStart, selEnd]);

  const handleSubmitComment = useCallback((comment: ReviewComment) => {
    dispatch(addReviewComment(comment));
    setCommentBoxLines(null);
    setSelStart(null);
    setSelEnd(null);
  }, [dispatch]);

  const cancelComment = useCallback(() => {
    setCommentBoxLines(null);
    setSelStart(null);
    setSelEnd(null);
  }, []);

  // highlight selected lines via CSS
  const selMin = selStart != null && selEnd != null ? Math.min(selStart, selEnd) : null;
  const selMax = selStart != null && selEnd != null ? Math.max(selStart, selEnd) : null;
  const highlightMin = commentBoxLines?.start ?? selMin;
  const highlightMax = commentBoxLines?.end ?? selMax;

  // build a style tag for selection highlight
  const selectionStyle = highlightMin != null && highlightMax != null
    ? Array.from({ length: highlightMax - highlightMin + 1 }, (_, i) => {
        const lineNo = highlightMin + i;
        return `[data-line-no="${lineNo}"]`;
      }).map((sel) => `${sel} { background: ${SELECTION_BG}; }`).join('\n')
      + '\n' + Array.from({ length: highlightMax - highlightMin + 1 }, (_, i) => {
        const lineNo = highlightMin + i;
        return `[data-line-no="${lineNo}"]`;
      }).map((sel) => `${sel} + * { background: ${SELECTION_BG}; }`).join('\n')
    : '';

  if (!view) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span style={{ fontSize: 14, color: 'var(--cr-muted-fg)' }}>Select a file to view</span>
      </div>
    );
  }

  const { path: selectedFile, viewMode, fileDiff, plainFile, loading: viewLoading, error: viewError, fileType } = view;
  const compareLabel = compareMode === 'primary' ? `vs ${compareBase ?? 'primary'}` : 'git status';
  const isDiff = viewMode === 'diff';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {selectionStyle && <style>{selectionStyle}</style>}
      <div style={{
        padding: '6px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '1px solid var(--cr-border)',
        background: 'var(--cr-bg)',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: 13, fontFamily: MONO_FONT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedFile}
        </span>

        {isDiff && (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--cr-muted-fg)' }}>
            {MODE_LABELS[diffMode]} · {compareLabel}
          </span>
        )}
      </div>

      <div
        id="diff-scroll-container"
        ref={scrollRef}
        style={{ flex: 1, overflow: 'auto', padding: 0, position: 'relative', cursor: selecting ? 'ns-resize' : undefined }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onScrollCapture={handleDiffScroll}
      >
        {viewLoading && <div style={{ padding: 16, color: 'var(--cr-muted-fg)' }}>Loading...</div>}
        {viewError && <div style={{ padding: 16, color: 'var(--cr-danger-fg)' }}>{viewError}</div>}

        {!viewLoading && !viewError && !isDiff && plainFile && !plainFile.tooLarge && (
          <PlainView content={plainFile.content} highlight={plainFile.highlight} />
        )}
        {!viewLoading && !viewError && !isDiff && plainFile?.tooLarge && (
          <div style={{ padding: 16, color: 'var(--cr-warning-fg)' }}>
            File exceeds 50 KB — skipped to keep the UI responsive.
          </div>
        )}

        {!viewLoading && !viewError && isDiff && fileDiff?.tooLarge && (
          <div style={{ padding: 16, color: 'var(--cr-warning-fg)' }}>
            File exceeds 50 KB — skipped to keep the UI responsive.
          </div>
        )}
        {!viewLoading && !viewError && isDiff && !fileDiff?.tooLarge && fileDiff === null && (
          <div style={{ padding: 16, color: 'var(--cr-muted-fg)' }}>
            {fileType === 'tracked' ? 'No diff available (file may be deleted).' : 'Empty file.'}
          </div>
        )}
        {!viewLoading && !viewError && isDiff && isStaleGit(fileDiff) && (
          <div style={{ padding: 16, color: 'var(--cr-muted-fg)' }}>
            File no longer differs in this compare mode.
          </div>
        )}
        {!viewLoading && !viewError && isDiff && fileDiff && !fileDiff.tooLarge && fileDiff.hunks.length > 0 && diffMode === 'unified' && (
          <UnifiedView
            hunks={fileDiff.hunks}
            oldFile={fileDiff.oldFile}
            newFile={fileDiff.newFile}
            oldHighlight={fileDiff.oldHighlight}
            newHighlight={fileDiff.newHighlight}
            gapState={gapState}
            gapShortcutNumbers={gapShortcutNumbers}
          />
        )}
        {!viewLoading && !viewError && isDiff && fileDiff && !fileDiff.tooLarge && fileDiff.hunks.length > 0 && diffMode === 'split' && (
          <SplitView
            hunks={fileDiff.hunks}
            oldFile={fileDiff.oldFile}
            newFile={fileDiff.newFile}
            oldHighlight={fileDiff.oldHighlight}
            newHighlight={fileDiff.newHighlight}
            gapState={gapState}
            gapShortcutNumbers={gapShortcutNumbers}
          />
        )}
        {!viewLoading && !viewError && isDiff && fileDiff && !fileDiff.tooLarge && fileDiff.hunks.length > 0 && diffMode === 'newest' && (
          <NewestView hunks={fileDiff.hunks} newFile={fileDiff.newFile} newHighlight={fileDiff.newHighlight} />
        )}

        {commentBoxLines && filePath && (
          <CommentDraftBox
            lines={commentBoxLines}
            filePath={filePath}
            newFile={view.fileDiff?.newFile}
            plainContent={view.plainFile?.content}
            submitShortcut={shortcuts.submitComment}
            copyShortcut={shortcuts.copyCurrentComment}
            onSubmit={handleSubmitComment}
            onCancel={cancelComment}
          />
        )}
      </div>
    </div>
  );
};
